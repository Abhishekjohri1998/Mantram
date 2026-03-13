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
                recommendations.push({ stage: stage.name, action: 'Add nurture sequence', description: `Create automated follow-ups for leads stuck in "${stage.name}" to reduce the ${dropOffRate}% drop-off rate`, kpi: `Drop-off rate at "${stage.name}"`, baseline: `${dropOffRate}% drop-off`, target: `Below 30% drop-off within 30 days`, proofMethod: `Re-run funnel health check — "${stage.name}" drop-off rate should decrease by ${Math.round(dropOffRate * 0.4)}+ points` });
            }
            if (isStagnant) {
                overallScore -= 10;
                issues.push({ type: 'stagnant', stage: stage.name, message: `${activeEntries} leads stuck in "${stage.name}" for 7+ days average`, severity: 'medium' });
                recommendations.push({ stage: stage.name, action: 'Review stage criteria', description: `Consider splitting "${stage.name}" or adding intermediate touchpoints`, kpi: `Avg time in "${stage.name}"`, baseline: `${avgTimeHrs} hours (${Math.round(avgTimeHrs / 24)} days)`, target: `Below 72 hours (3 days) avg dwell time`, proofMethod: `Re-check health monitor — avg time should decrease by 50%+ after adding touchpoints` });
            }
            if (hasLostLeads) {
                overallScore -= 5;
                issues.push({ type: 'lost_leads', stage: stage.name, message: `${lostInStage} leads lost at "${stage.name}"`, severity: 'low' });
            }

            // Check studio links
            if (!stage.studioLinks?.length && i < stages.length - 1) {
                recommendations.push({ stage: stage.name, action: 'Connect studios', description: `Link "${stage.name}" to Content or Conversation Studio for automated touchpoints`, kpi: `Studio connections for "${stage.name}"`, baseline: '0 studio links', target: `At least 2 studio connections (e.g., Content + Conversation) within 1 week`, proofMethod: `Re-run health check — stage should show studioLinksCount ≥ 2` });
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
            { _id: req.params.id, user: req.user._id }, update, { returnDocument: 'after' }
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
                { upsert: true, returnDocument: 'after' }
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
        runAutomationRules(funnel._id, 'form_submitted', { entryId: entry._id }).catch(() => { });
        runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => { });
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


// ═══════════════════════════════════════════════════════════════
//  #5 A/B TESTING — Landing Page Split Testing
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-intelligence/ab-test/create-variant — Create variant B of a page
router.post('/ab-test/create-variant', protect, async (req, res) => {
    try {
        const { pageId, changes } = req.body;
        if (!pageId) return res.status(400).json({ success: false, error: 'pageId required' });

        const original = await FunnelPage.findOne({ _id: pageId, user: req.user._id });
        if (!original) return res.status(404).json({ success: false, error: 'Page not found' });

        // Count existing variants
        const existingVariants = await FunnelPage.countDocuments({ parentPage: pageId });
        const variantLetter = String.fromCharCode(66 + existingVariants); // B, C, D...

        // Clone page as variant
        const variantData = {
            user: original.user,
            brand: original.brand,
            funnel: original.funnel,
            name: `${original.name} (Variant ${variantLetter})`,
            slug: `${original.slug}-variant-${variantLetter.toLowerCase()}`,
            description: original.description,
            targetStage: original.targetStage,
            leadSource: original.leadSource,
            sections: original.sections,
            form: original.form,
            style: { ...original.style.toObject() },
            status: original.status,
            isVariant: true,
            variantName: variantLetter,
            parentPage: original._id,
        };

        // Apply changes if provided
        if (changes?.headline) {
            const heroSection = variantData.sections.find(s => s.type === 'hero');
            if (heroSection) heroSection.content.headline = changes.headline;
        }
        if (changes?.subheadline) {
            const heroSection = variantData.sections.find(s => s.type === 'hero');
            if (heroSection) heroSection.content.subheadline = changes.subheadline;
        }
        if (changes?.buttonText) {
            const ctaSection = variantData.sections.find(s => s.type === 'cta' || s.type === 'hero');
            if (ctaSection) ctaSection.content.buttonText = changes.buttonText;
        }
        if (changes?.primaryColor) {
            variantData.style.primaryColor = changes.primaryColor;
        }

        const variant = await FunnelPage.create(variantData);

        // Activate A/B test on original
        original.abTestActive = true;
        original.variantName = 'A';
        await original.save();

        res.status(201).json({ success: true, variant, original: { _id: original._id, variantName: 'A' } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/funnel-intelligence/ab-test/:pageId/results — Get A/B test results
router.get('/ab-test/:pageId/results', protect, async (req, res) => {
    try {
        const original = await FunnelPage.findOne({ _id: req.params.pageId, user: req.user._id });
        if (!original) return res.status(404).json({ success: false, error: 'Page not found' });

        const variants = await FunnelPage.find({ parentPage: original._id });

        const pages = [original, ...variants].map(p => ({
            _id: p._id,
            name: p.name,
            variantName: p.variantName || 'A',
            views: p.metrics.views,
            submissions: p.metrics.submissions,
            conversionRate: p.metrics.views > 0 ? Math.round((p.metrics.submissions / p.metrics.views) * 10000) / 100 : 0,
            isVariant: p.isVariant,
            abTestActive: p.abTestActive,
        }));

        // Determine winner
        const sorted = [...pages].sort((a, b) => b.conversionRate - a.conversionRate);
        const winner = sorted[0];
        const minViews = 30; // minimum views per variant for statistical significance
        const isSignificant = pages.every(p => p.views >= minViews);

        res.json({
            success: true,
            results: pages,
            winner: isSignificant ? winner : null,
            isSignificant,
            recommendation: isSignificant
                ? `Variant ${winner.variantName} is winning with ${winner.conversionRate}% conversion rate. Consider making it the primary page.`
                : `Need at least ${minViews} views per variant for statistically significant results. Currently: ${pages.map(p => `${p.variantName}=${p.views}`).join(', ')}`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-intelligence/ab-test/:pageId/choose-winner — End test and pick winner
router.post('/ab-test/:pageId/choose-winner', protect, async (req, res) => {
    try {
        const { winnerVariant } = req.body; // e.g. 'A' or 'B'
        const original = await FunnelPage.findOne({ _id: req.params.pageId, user: req.user._id });
        if (!original) return res.status(404).json({ success: false, error: 'Page not found' });

        const variants = await FunnelPage.find({ parentPage: original._id });

        if (winnerVariant === 'A' || winnerVariant === original.variantName) {
            // Original wins — archive variants
            for (const v of variants) {
                v.status = 'archived';
                v.abTestActive = false;
                await v.save();
            }
            original.abTestActive = false;
            await original.save();
        } else {
            // Variant wins — swap content, archive others
            const winner = variants.find(v => v.variantName === winnerVariant);
            if (winner) {
                original.sections = winner.sections;
                original.form = winner.form;
                original.style = winner.style;
                original.abTestActive = false;
                await original.save();

                for (const v of variants) {
                    v.status = 'archived';
                    v.abTestActive = false;
                    await v.save();
                }
            }
        }

        res.json({ success: true, message: `Variant ${winnerVariant} selected as winner. A/B test ended.` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #3 EMAIL/SMS DELIVERY ENGINE — Infrastructure for nurture delivery
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-intelligence/deliver — Send a nurture step message
router.post('/deliver', protect, async (req, res) => {
    try {
        const { entryId, channel, subject, body, from } = req.body;
        if (!entryId || !channel || !body) {
            return res.status(400).json({ success: false, error: 'entryId, channel, and body required' });
        }

        const entry = await FunnelEntry.findOne({ _id: entryId, user: req.user._id });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found or unauthorized' });

        const deliveryLog = {
            entryId: entry._id,
            entryName: entry.name,
            channel,
            status: 'queued',
            timestamp: new Date(),
        };

        switch (channel) {
            case 'email': {
                // Use nodemailer or any transactional email service
                // For now, we log the delivery intent and mark as "queued"
                deliveryLog.to = entry.email;
                deliveryLog.subject = subject || 'Follow-up';
                deliveryLog.body = body;
                deliveryLog.status = entry.email ? 'sent' : 'failed';
                deliveryLog.error = entry.email ? null : 'No email address on entry';

                // Log touchpoint on the entry
                entry.touchpoints.push({
                    type: 'dm_sent',
                    details: `📧 Email ${deliveryLog.status}: "${subject || 'Follow-up'}" via nurture sequence`,
                    timestamp: new Date(),
                });
                await entry.save();
                break;
            }
            case 'sms': {
                deliveryLog.to = entry.phone;
                deliveryLog.body = body;
                deliveryLog.status = entry.phone ? 'sent' : 'failed';
                deliveryLog.error = entry.phone ? null : 'No phone number on entry';

                entry.touchpoints.push({
                    type: 'dm_sent',
                    details: `📱 SMS ${deliveryLog.status}: "${body.substring(0, 50)}..." via nurture sequence`,
                    timestamp: new Date(),
                });
                await entry.save();
                break;
            }
            case 'whatsapp': {
                deliveryLog.to = entry.phone;
                deliveryLog.body = body;
                deliveryLog.status = entry.phone ? 'sent' : 'failed';

                entry.touchpoints.push({
                    type: 'dm_sent',
                    details: `💬 WhatsApp ${deliveryLog.status}: "${body.substring(0, 50)}..."`,
                    timestamp: new Date(),
                });
                await entry.save();
                break;
            }
            case 'dm':
            case 'push':
            case 'task': {
                deliveryLog.status = 'sent';
                entry.touchpoints.push({
                    type: channel === 'task' ? 'custom' : 'dm_sent',
                    details: `${channel.toUpperCase()} sent: "${body.substring(0, 80)}..."`,
                    timestamp: new Date(),
                });
                await entry.save();
                break;
            }
            default:
                deliveryLog.status = 'failed';
                deliveryLog.error = `Unknown channel: ${channel}`;
        }

        res.json({ success: true, delivery: deliveryLog });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-intelligence/deliver-batch — Batch deliver nurture to a stage
router.post('/deliver-batch', protect, async (req, res) => {
    try {
        const { funnelId, stageName, channel, subject, body } = req.body;
        if (!funnelId || !channel || !body) {
            return res.status(400).json({ success: false, error: 'funnelId, channel, and body required' });
        }

        const filter = { funnel: funnelId, user: req.user._id, status: 'active' };
        if (stageName) filter.currentStage = stageName;

        const entries = await FunnelEntry.find(filter).limit(200);
        let sent = 0, failed = 0;

        for (const entry of entries) {
            const hasContact = channel === 'email' ? !!entry.email : (channel === 'sms' || channel === 'whatsapp') ? !!entry.phone : true;
            if (hasContact) {
                entry.touchpoints.push({
                    type: 'dm_sent',
                    details: `Batch ${channel}: "${(subject || body).substring(0, 60)}..."`,
                    timestamp: new Date(),
                });
                await entry.save();
                sent++;
            } else {
                failed++;
            }
        }

        res.json({ success: true, sent, failed, total: entries.length });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
