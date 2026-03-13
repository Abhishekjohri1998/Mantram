/**
 * Studio Reports — Unified API Routes
 * 
 * CRUD + generation endpoints for branded interactive reports across all studios.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import StudioReport from '../models/StudioReport.js';
import Brand from '../models/Brand.js';
import { generateReportNode } from '../agents/reportGenerator/nodes.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE REPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/studio-reports/generate
 * Generate a new branded report for any studio
 */
router.post('/generate', protect, async (req, res) => {
    try {
        const { studio, reportType, brandId, options = {} } = req.body;

        if (!studio || !reportType) {
            return res.status(400).json({
                success: false,
                error: 'studio and reportType are required',
            });
        }

        const effectiveBrandId = brandId || req.user.activeBrand;
        if (!effectiveBrandId) {
            return res.status(400).json({
                success: false,
                error: 'brandId is required — select a brand first',
            });
        }

        // Create the report placeholder
        const report = await StudioReport.create({
            user: req.user._id,
            brand: effectiveBrandId,
            studio,
            reportType,
            title: `Generating ${studio.toUpperCase()} ${reportType} report...`,
            status: 'generating',
        });

        // Run the report generation pipeline in the background (Async)
        // We don't await this so we can return the placeholder immediately
        (async () => {
            try {
                const state = await generateReportNode({
                    reportId: report._id.toString(),
                    userId: req.user._id.toString(),
                    brandId: effectiveBrandId.toString(),
                    studio,
                    reportType,
                    options,
                });

                // Save the result
                const update = {
                    status: state.status || 'complete',
                    title: state.title || report.title,
                    sections: state.sections || [],
                    narrative: state.narrative || {},
                    slides: state.slides || [],
                    branding: state.branding || {},
                    sourceData: state.sourceData || {},
                };
                if (state.error) update.error = state.error;

                await StudioReport.findByIdAndUpdate(report._id, update);
                console.log(`✅ Studio Report ${report._id} generated successfully`);
            } catch (bgError) {
                console.error(`❌ Background Report Generation Error (${report._id}):`, bgError);
                await StudioReport.findByIdAndUpdate(report._id, {
                    status: 'failed',
                    error: safeErrorMessage(bgError)
                });
            }
        })();

        // Return placeholder immediately to prevent timeout
        res.json({
            success: true,
            report: report.toObject(),
        });
    } catch (error) {
        console.error('Studio Report generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIST REPORTS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/studio-reports
 * List reports (filter by studio, brand, type)
 */
router.get('/', protect, async (req, res) => {
    try {
        const { studio, brandId, reportType, limit = 20 } = req.query;
        const filter = { user: req.user._id };
        if (studio) filter.studio = studio;
        if (brandId) filter.brand = brandId;
        if (reportType) filter.reportType = reportType;

        const reports = await StudioReport.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .select('title studio reportType status branding.brandName createdAt updatedAt')
            .lean();

        res.json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET SINGLE REPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/studio-reports/:id
 * Get full report with all sections and data
 */
router.get('/:id', protect, async (req, res) => {
    try {
        const report = await StudioReport.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// UPDATE REPORT (inline editing)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * PUT /api/studio-reports/:id
 * Update report sections, narrative, slides, or title
 */
router.put('/:id', protect, async (req, res) => {
    try {
        const { title, sections, narrative, slides } = req.body;
        const update = {};
        if (title) update.title = title;
        if (sections) update.sections = sections;
        if (narrative) update.narrative = narrative;
        if (slides) update.slides = slides;

        const report = await StudioReport.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            update,
            { returnDocument: 'after' }
        ).lean();

        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE REPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * DELETE /api/studio-reports/:id
 */
router.delete('/:id', protect, async (req, res) => {
    try {
        const report = await StudioReport.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        res.json({ success: true, message: 'Report deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-GENERATE SLIDES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/studio-reports/:id/slides
 * Auto-generate slideshow structure from existing report sections
 */
router.post('/:id/slides', protect, async (req, res) => {
    try {
        const report = await StudioReport.findOne({
            _id: req.params.id,
            user: req.user._id,
        });

        if (!report) {
            return res.status(404).json({ success: false, error: 'Report not found' });
        }

        // Auto-generate slides from sections
        const slides = [];

        // Slide 1: Title slide
        slides.push({
            title: report.title,
            sectionIds: [],
            notes: report.narrative?.executiveSummary || '',
            layout: 'full',
        });

        // Slide 2: Executive Summary + KPIs
        const kpiSection = report.sections?.find(s => s.type === 'kpi-grid');
        if (kpiSection) {
            slides.push({
                title: 'Key Metrics Overview',
                sectionIds: [kpiSection.id],
                notes: 'Here are the key performance indicators for this period.',
                layout: 'full',
            });
        }

        // Subsequent slides: one per chart/table/text section
        const contentSections = report.sections?.filter(
            s => s.type !== 'kpi-grid' && s.id
        ) || [];
        
        for (const section of contentSections) {
            slides.push({
                title: section.title || section.id,
                sectionIds: [section.id],
                notes: '',
                layout: section.type === 'chart' ? 'full' : 'split',
            });
        }

        // Final slide: Recommendations
        const recoSection = report.sections?.find(s => s.type === 'recommendations');
        if (recoSection && !slides.some(sl => sl.sectionIds.includes(recoSection.id))) {
            slides.push({
                title: 'Recommendations & Next Steps',
                sectionIds: [recoSection.id],
                notes: 'Our top recommendations based on the analysis.',
                layout: 'full',
            });
        }

        report.slides = slides;
        await report.save();

        res.json({ success: true, slides, report: report.toObject() });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
