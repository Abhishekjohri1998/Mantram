import { Router } from 'express';
import Brand from '../models/Brand.js';
import BrandAuditLog from '../models/BrandAuditLog.js';
import Product from '../models/Product.js';
import Integration from '../models/Integration.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import multer from 'multer';
import crypto from 'crypto';
import { safeErrorMessage } from '../utils/safeError.js';


const router = Router();

// ═══════════════════════════════════════════════════════════════
// Helper: Create audit log entry
// ═══════════════════════════════════════════════════════════════
async function logAudit(brand, user, action, { section = '', summary = '', changes = {} } = {}) {
    try {
        await BrandAuditLog.create({
            brand: brand._id || brand,
            user: user._id || user,
            userName: user.name || user.email || 'Unknown',
            action,
            section,
            summary,
            changes,
        });
    } catch (err) {
        console.warn('Audit log write failed:', err.message);
    }
}

// Helper: Check brand ownership or shared access
async function findBrandWithAccess(brandId, userId) {
    return Brand.findOne({
        _id: brandId,
        $or: [{ user: userId }, { sharedWith: userId }],
    });
}

// ═══════════════════════════════════════════════════════════════
// GET /api/brands — list user's brands
// By default, excludes archived brands.
// ?include=archived → only archived brands (for archive page)
// ?include=all      → everything (admin use)
// ═══════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const query = {
            $or: [{ user: req.user._id }, { sharedWith: req.user._id }]
        };

        // Status filtering — exclude archived by default
        const include = req.query.include;
        if (include === 'archived') {
            query.status = 'archived';
        } else if (include === 'all') {
            // No status filter — return everything
        } else {
            // Default: exclude archived
            query.status = { $ne: 'archived' };
        }

        const brands = await Brand.find(query).sort('-updatedAt');
        res.json({ success: true, brands });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brands/:id
// ═══════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brands — create new brand
// ═══════════════════════════════════════════════════════════════
router.post('/', protect, async (req, res) => {
    try {
        const brand = await Brand.create({ ...req.body, user: req.user._id });
        await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
        await logAudit(brand, req.user, 'brand_created', {
            summary: `Brand "${brand.name}" created via ${brand.onboardingMethod || 'website'} onboarding`,
        });
        res.status(201).json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id — update brand (general fields)
// ═══════════════════════════════════════════════════════════════
router.put('/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] },
            req.body,
            { returnDocument: 'after', runValidators: true }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        await logAudit(brand, req.user, 'dna_updated', {
            summary: `Brand settings updated`,
            changes: { updatedFields: Object.keys(req.body) },
        });

        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/dna — update specific DNA fields (with audit)
// ═══════════════════════════════════════════════════════════════
router.put('/:id/dna', protect, async (req, res) => {
    try {
        // Fetch current brand for before-values
        const currentBrand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!currentBrand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const updates = {};
        const changedSections = [];
        const changeDetails = {};

        for (const [key, value] of Object.entries(req.body)) {
            updates[`dna.${key}`] = value;
            changedSections.push(key);
            // Capture before/after for audit
            changeDetails[key] = {
                from: currentBrand.dna?.[key],
                to: value,
            };
        }

        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] },
            { $set: updates },
            { returnDocument: 'after' }
        );

        // Determine the most specific audit action
        const sectionMap = {
            voice: 'voice_updated',
            colors: 'colors_updated',
            fonts: 'fonts_updated',
            contentStyle: 'content_style_updated',
            brandDescription: 'description_updated',
            targetAudience: 'audience_updated',
            industry: 'industry_updated',
            brandImages: 'images_updated',
        };

        const action = changedSections.length === 1 && sectionMap[changedSections[0]]
            ? sectionMap[changedSections[0]]
            : 'dna_updated';

        await logAudit(brand, req.user, action, {
            section: changedSections.join(', '),
            summary: `Updated brand DNA: ${changedSections.join(', ')}`,
            changes: changeDetails,
        });

        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/knowledge — dedicated knowledge update endpoint
// Supports updating any combination of knowledge fields with full audit trail
// ═══════════════════════════════════════════════════════════════
router.put('/:id/knowledge', protect, async (req, res) => {
    try {
        const currentBrand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!currentBrand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const { section, data } = req.body;
        if (!section || !data) {
            return res.status(400).json({ success: false, error: 'section and data are required' });
        }

        // Build update based on section
        const updates = {};
        const validSections = [
            'voice', 'colors', 'fonts', 'contentStyle', 'brandDescription',
            'targetAudience', 'industry', 'country', 'region',
            'defaultLanguage', 'languageStyle', 'brandImages',
        ];

        if (!validSections.includes(section)) {
            return res.status(400).json({ success: false, error: `Invalid section: ${section}` });
        }

        // For object/array sections, merge or replace
        if (typeof data === 'object' && !Array.isArray(data) && ['voice', 'fonts', 'contentStyle'].includes(section)) {
            // Merge sub-fields (e.g. voice.tone = 75)
            for (const [key, value] of Object.entries(data)) {
                updates[`dna.${section}.${key}`] = value;
            }
        } else {
            updates[`dna.${section}`] = data;
        }

        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id },
            { $set: updates },
            { returnDocument: 'after' }
        );

        const sectionMap = {
            voice: 'voice_updated', colors: 'colors_updated', fonts: 'fonts_updated',
            contentStyle: 'content_style_updated', brandDescription: 'description_updated',
            targetAudience: 'audience_updated', industry: 'industry_updated',
            brandImages: 'images_updated',
        };

        await logAudit(brand, req.user, sectionMap[section] || 'knowledge_added', {
            section,
            summary: `Updated ${section} knowledge`,
            changes: { from: currentBrand.dna?.[section], to: data },
        });

        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/brands/:id/audit-log — paginated change history
// ═══════════════════════════════════════════════════════════════
router.get('/:id/audit-log', protect, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [logs, total] = await Promise.all([
            BrandAuditLog.find({ brand: req.params.id })
                .sort('-createdAt')
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            BrandAuditLog.countDocuments({ brand: req.params.id }),
        ]);

        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/brands/:id/analyze-visual-dna — AI-powered visual identity analysis
// Extracts design style, typography, layout, mood, rules from brand data
// ═══════════════════════════════════════════════════════════════
router.post('/:id/analyze-visual-dna', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        console.log(`🎨 Analyzing Visual DNA for brand: ${brand.name}`);
        const { analyzeVisualDNA } = await import('../services/visualDNA.js');
        const visualDNA = await analyzeVisualDNA(brand);

        if (!visualDNA) {
            return res.status(500).json({ success: false, error: 'Visual DNA analysis failed — please try again' });
        }

        // Save to brand
        await Brand.findOneAndUpdate(
            { _id: brand._id },
            { $set: { 'dna.visualDNA': visualDNA } }
        );

        await logAudit(brand, req.user, 'visual_dna_analyzed', {
            section: 'visualDNA',
            summary: `AI Visual DNA analyzed: ${visualDNA.designStyle}, ${visualDNA.typographyStyle}, ${visualDNA.imageMood}`,
            changes: { visualDNA },
        });

        console.log(`✅ Visual DNA saved for ${brand.name}: style=${visualDNA.designStyle}, mood=${visualDNA.imageMood}`);
        res.json({ success: true, visualDNA });
    } catch (error) {
        console.error('❌ Visual DNA analysis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/autonomy — update autonomy settings
// ═══════════════════════════════════════════════════════════════
router.put('/:id/autonomy', protect, async (req, res) => {
    try {
        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            updates[`autonomy.${key}`] = value;
        }
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { $set: updates },
            { returnDocument: 'after' }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/brands/:id — cascade delete brand and all related data
// ═══════════════════════════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found or access denied' });

        const brandName = brand.name;

        // Cascade delete related data
        const [deletedProducts, deletedIntegrations, deletedLogs] = await Promise.all([
            Product.deleteMany({ brand: brand._id }),
            Integration.deleteMany({ brand: brand._id }),
            BrandAuditLog.deleteMany({ brand: brand._id }),
        ]);

        // Remove brand from team members' brandAccess
        await User.updateMany(
            { brandAccess: brand._id },
            { $pull: { brandAccess: brand._id } }
        );

        // Delete the brand itself
        await Brand.deleteOne({ _id: brand._id });

        console.log(`🗑️ Brand "${brandName}" deleted. Cleaned: ${deletedProducts.deletedCount} products, ${deletedIntegrations.deletedCount} integrations, ${deletedLogs.deletedCount} audit logs`);

        res.json({
            success: true,
            message: `Brand "${brandName}" and all related data deleted`,
            cleaned: {
                products: deletedProducts.deletedCount,
                integrations: deletedIntegrations.deletedCount,
                auditLogs: deletedLogs.deletedCount,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/brands/:id/status — toggle active/archived
// ═══════════════════════════════════════════════════════════════
router.put('/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'archived'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Status must be active or archived' });
        }
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { status },
            { returnDocument: 'after' }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        await logAudit(brand, req.user, status === 'archived' ? 'brand_archived' : 'brand_restored', {
            summary: `Brand ${status === 'archived' ? 'archived' : 'restored to active'}`,
        });

        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// Custom Templates (Prompt Library)
// ═══════════════════════════════════════════════════════════════

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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/templates — list custom templates
router.get('/:id/templates', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, templates: brand.customTemplates || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// Custom Categories
// ═══════════════════════════════════════════════════════════════

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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/categories — list custom categories
router.get('/:id/categories', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, categories: brand.customCategories || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/brands/:id/categories/:categoryId — delete a custom category
router.delete('/:id/categories/:categoryId', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        brand.customCategories = brand.customCategories.filter(c => c.categoryId !== req.params.categoryId);
        brand.customTemplates = brand.customTemplates.filter(t => t.category !== req.params.categoryId);
        await brand.save();
        res.json({ success: true, message: 'Category and its templates deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// BRAND KNOWLEDGE INGESTION
// ═══════════════════════════════════════════════════════════════

const knowledgeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'application/pdf',
            'text/plain',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
            'text/markdown',
        ];
        if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|txt|doc|docx|csv|md)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type. Use PDF, TXT, DOC, DOCX, CSV, or MD.'));
        }
    },
});

// POST /api/brands/:id/knowledge/ingest — add knowledge from text, file, or URL
router.post('/:id/knowledge/ingest', protect, knowledgeUpload.single('file'), async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const { sourceType, title, text, url } = req.body;
        let content = '';
        let entryTitle = title || '';
        let sourceUrl = '';
        let fileName = '';

        // ── TEXT INPUT ──
        if (sourceType === 'text') {
            content = (text || '').trim();
            if (!content) return res.status(400).json({ success: false, error: 'Text content is required' });
            entryTitle = entryTitle || content.substring(0, 80).replace(/\n/g, ' ') + (content.length > 80 ? '…' : '');
        }

        // ── FILE UPLOAD ──
        else if (sourceType === 'file') {
            if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
            fileName = req.file.originalname;
            entryTitle = entryTitle || fileName;

            if (req.file.mimetype === 'application/pdf' || fileName.endsWith('.pdf')) {
                try {
                    const pdfParse = (await import('pdf-parse')).default;
                    const result = await pdfParse(req.file.buffer);
                    content = result.text?.trim() || '';
                } catch (err) {
                    return res.status(400).json({ success: false, error: `Failed to parse PDF: ${err.message}` });
                }
            } else {
                // TXT, CSV, MD, DOC — read as text
                content = req.file.buffer.toString('utf-8').trim();
            }

            if (!content) return res.status(400).json({ success: false, error: 'Could not extract text from file' });
        }

        // ── URL SCRAPING ──
        else if (sourceType === 'url') {
            if (!url) return res.status(400).json({ success: false, error: 'URL is required' });
            // BUG-9 FIX: Block SSRF to internal/private networks
            try {
                const parsed = new URL(url);
                const host = parsed.hostname.toLowerCase();
                const blocked = [/^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./, /^0\./, /\.internal$/, /\.local$/];
                if (blocked.some(p => p.test(host)) || !['http:', 'https:'].includes(parsed.protocol)) {
                    return res.status(400).json({ success: false, error: 'URL points to an internal or blocked network' });
                }
            } catch { return res.status(400).json({ success: false, error: 'Invalid URL format' }); }
            sourceUrl = url;
            try {
                const { crawlPage } = await import('../utils/web-research.js');
                const pageData = await crawlPage(url);
                if (!pageData.success) {
                    return res.status(400).json({ success: false, error: `Failed to scrape URL: ${pageData.error}` });
                }
                content = pageData.contentSnippet || '';
                // Get full body text if available
                const rawFetch = await fetch(url, {
                    headers: { 'User-Agent': 'MantramAI-KnowledgeBot/1.0' },
                    signal: AbortSignal.timeout(12000),
                });
                if (rawFetch.ok) {
                    const html = await rawFetch.text();
                    // Strip tags to get full text
                    const fullText = html
                        .replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    if (fullText.length > content.length) {
                        content = fullText.substring(0, 50000); // cap at 50k chars
                    }
                }
                entryTitle = entryTitle || pageData.title || new URL(url).hostname;
            } catch (err) {
                return res.status(400).json({ success: false, error: `Failed to scrape URL: ${err.message}` });
            }
        } else {
            return res.status(400).json({ success: false, error: 'sourceType must be text, file, or url' });
        }

        // Cap content at 50k characters
        if (content.length > 50000) content = content.substring(0, 50000);

        // ══════════════════════════════════════════════════════════════
        // SMART DUPLICATE DETECTION — analyze before saving
        // ══════════════════════════════════════════════════════════════
        const force = req.body.force === 'true' || req.body.force === true;
        const replaceEntryId = req.body.replaceEntryId || null;

        if (!force) {
            const { detectDuplicates } = await import('../utils/knowledge-dedup.js');
            const existingEntries = brand.knowledge?.entries || [];
            const warnings = detectDuplicates(
                { title: entryTitle, content, sourceUrl, fileName, sourceType },
                existingEntries
            );

            if (warnings.length > 0) {
                // Don't save — return warnings for the user to decide
                return res.json({
                    success: false,
                    duplicateWarnings: warnings,
                    pendingEntry: { title: entryTitle, charCount: content.length, sourceType },
                    message: 'Potential duplicates detected. Review and choose an action.',
                });
            }
        }

        // If replacing an existing entry, remove it first
        if (replaceEntryId && brand.knowledge?.entries) {
            brand.knowledge.entries = brand.knowledge.entries.filter(e => e.id !== replaceEntryId);
        }

        const entry = {
            id: crypto.randomUUID(),
            sourceType,
            title: entryTitle,
            content,
            sourceUrl,
            fileName,
            charCount: content.length,
            addedAt: new Date(),
        };

        // Push to knowledge entries
        if (!brand.knowledge) brand.knowledge = { entries: [] };
        brand.knowledge.entries.push(entry);
        await brand.save();

        await logAudit(brand, req.user, 'knowledge_added', {
            section: 'knowledge',
            summary: `Added ${sourceType} knowledge: "${entryTitle}" (${content.length} chars)${replaceEntryId ? ' [replaced existing]' : ''}`,
        });

        res.json({ success: true, entry });
    } catch (error) {
        console.error('Knowledge ingest error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/brands/:id/knowledge/entries — list knowledge entries (without full content)
router.get('/:id/knowledge/entries', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const entries = (brand.knowledge?.entries || []).map(e => ({
            id: e.id,
            sourceType: e.sourceType,
            title: e.title,
            sourceUrl: e.sourceUrl,
            fileName: e.fileName,
            charCount: e.charCount,
            addedAt: e.addedAt,
            preview: e.content?.substring(0, 200) || '',
        }));

        res.json({ success: true, entries });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/brands/:id/knowledge/entries/:entryId — remove a knowledge entry
router.delete('/:id/knowledge/entries/:entryId', protect, async (req, res) => {
    try {
        const brand = await findBrandWithAccess(req.params.id, req.user._id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const entry = brand.knowledge?.entries?.find(e => e.id === req.params.entryId);
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        brand.knowledge.entries = brand.knowledge.entries.filter(e => e.id !== req.params.entryId);
        await brand.save();

        await logAudit(brand, req.user, 'knowledge_removed', {
            section: 'knowledge',
            summary: `Removed ${entry.sourceType} knowledge: "${entry.title}"`,
        });

        res.json({ success: true, message: 'Entry deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
