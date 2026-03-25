/**
 * Retention Studio — Backend Routes
 * 
 * RESTful API for the Amazon→D2C re-engagement pipeline.
 * Route prefix: /api/retention-studio
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import RetentionCampaign from '../models/RetentionCampaign.js';
import Brand from '../models/Brand.js';
import { runNode, runPipeline, getPipelineInfo } from '../agents/retention/engine.js';
import { substituteTemplate } from '../agents/retention/nodes.js';
import { sendRetentionEmail, isEmailConfigured } from '../agents/retention/mailer.js';
import { runRFMAnalysis, getSegmentCustomers, getSegmentRecommendations } from '../agents/retention/segmentation.js';
import { findWinBackCandidates, findPriceDropProducts, findRecentBuyers, createABTest, calculateABResults, generateCampaignUTM } from '../agents/retention/campaigns.js';
import { getAllTemplates, getTemplate, getTemplatesByCategory } from '../agents/retention/flowTemplates.js';
import { getUnifiedContacts, findDuplicates, getMarketableContacts } from '../agents/retention/contactMerge.js';
import { sendSMS, sendBulkSMS, getSMSProviderInfo } from '../services/smsProvider.js';
import { sendPush, sendBulkPush, sendToTopic, subscribeToTopic, getPushProviderInfo, getServiceWorkerCode } from '../services/pushNotificationService.js';
import { generateWidgetScript, getEmbedSnippet, getWidgetOptions } from '../services/leadFormWidget.js';
import { trackPageView, getAbandonmentCandidates, generateTrackingScript, getTrackerStats } from '../agents/retention/browseTracker.js';

const router = express.Router();

// ══════════════════════════════════════════════════════════════
// GET / — List all retention campaigns for current brand
// ══════════════════════════════════════════════════════════════
router.get('/', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const query = { user: req.user._id };
        if (brandId) query.brand = brandId;

        const campaigns = await RetentionCampaign.find(query)
            .select('-contacts -creative.generatedHtml -mailer.bodyHtml -ingestData.rawData')
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        res.json({ success: true, campaigns });
    } catch (err) {
        console.error('[Retention] List error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// GET /campaigns/:id — Get full campaign details
// ══════════════════════════════════════════════════════════════
router.get('/:id', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (err) {
        console.error('[Retention] Get error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns — Create a new retention campaign
// ══════════════════════════════════════════════════════════════
router.post('/', protect, async (req, res) => {
    try {
        const { brandId, title, description } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const campaign = await RetentionCampaign.create({
            user: req.user._id,
            brand: brandId,
            title: title || `Amazon Re-Engagement — ${new Date().toLocaleDateString()}`,
            description: description || '',
            status: 'draft',
            fromName: brand.name || '',
            fromEmail: '', // User configures ESP details
        });

        res.json({ success: true, campaign });
    } catch (err) {
        console.error('[Retention] Create error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// DELETE /campaigns/:id — Delete a campaign
// ══════════════════════════════════════════════════════════════
router.delete('/:id', protect, async (req, res) => {
    try {
        const result = await RetentionCampaign.deleteOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[Retention] Delete error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /:id/ingest — Node 1: Ingest Amazon data (accepts JSON or FormData)
// ══════════════════════════════════════════════════════════════
router.post('/:id/ingest', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        // Support both JSON body and FormData
        let rawData, source;
        if (req.body && req.body.rawData) {
            // JSON body
            rawData = req.body.rawData;
            source = req.body.source;
        } else if (req.file) {
            // FormData file upload
            rawData = req.file.buffer.toString('utf8');
            source = req.body?.source || 'csv';
        } else if (req.body && typeof req.body === 'object') {
            // FormData text fields (no file)
            rawData = req.body.rawData || req.body.data || req.body.csv;
            source = req.body.source;
        }
        if (!rawData) return res.status(400).json({ success: false, error: 'rawData is required (CSV text — send as JSON body or FormData file)' });

        // Run ingest node
        const state = {
            brandId: campaign.brand,
            userId: req.user._id,
            input: { rawData, source: source || 'csv' },
        };

        const result = await runNode('ingest', state);

        // Update campaign
        campaign.contacts = result.contacts;
        campaign.ingestData = result.ingestData;
        campaign.currentNode = 'match';
        campaign.status = 'matching';
        await campaign.save();

        res.json({
            success: true,
            totalImported: result.ingestData.totalImported,
            duplicatesRemoved: result.ingestData.duplicatesRemoved,
            contacts: result.contacts.slice(0, 10), // Preview first 10
        });
    } catch (err) {
        console.error('[Retention] Ingest error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/match — Node 2: Match & Enrich with Shopify
// ══════════════════════════════════════════════════════════════
router.post('/:id/match', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const state = {
            brandId: campaign.brand,
            userId: req.user._id,
            contacts: campaign.contacts,
        };

        const result = await runNode('match', state);

        campaign.contacts = result.contacts;
        campaign.matchResults = result.matchResults;
        campaign.currentNode = 'creative';
        campaign.status = 'designing';
        await campaign.save();

        res.json({
            success: true,
            matchResults: result.matchResults,
            matchedContacts: result.contacts.filter(c => c.matched).slice(0, 10),
        });
    } catch (err) {
        console.error('[Retention] Match error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/creative — Node 3: Generate creative
// ══════════════════════════════════════════════════════════════
router.post('/:id/creative', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const { creativeTemplate } = req.body;

        const state = {
            brandId: campaign.brand,
            userId: req.user._id,
            contacts: campaign.contacts,
            matchResults: campaign.matchResults,
            input: { creativeTemplate: creativeTemplate || 'price-showdown' },
        };

        const result = await runNode('creative', state);

        campaign.creative = result.creative;
        campaign.currentNode = 'compose';
        campaign.status = 'composing';
        await campaign.save();

        res.json({
            success: true,
            creative: result.creative,
        });
    } catch (err) {
        console.error('[Retention] Creative error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/compose — Node 4: Generate full mailer
// ══════════════════════════════════════════════════════════════
router.post('/:id/compose', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const { mailerTemplate } = req.body;

        const state = {
            brandId: campaign.brand,
            userId: req.user._id,
            contacts: campaign.contacts,
            matchResults: campaign.matchResults,
            creative: campaign.creative,
            input: { mailerTemplate: mailerTemplate || 'clean-minimal' },
        };

        const result = await runNode('compose', state);

        campaign.mailer = result.mailer;
        campaign.currentNode = 'send';
        campaign.status = 'reviewing';
        await campaign.save();

        res.json({
            success: true,
            mailer: result.mailer,
        });
    } catch (err) {
        console.error('[Retention] Compose error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/approve — Approve creative/mailer
// ══════════════════════════════════════════════════════════════
router.post('/:id/approve', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const { approveType } = req.body; // 'creative' or 'mailer'

        if (approveType === 'creative') {
            campaign.creative.approved = true;
        } else if (approveType === 'mailer') {
            campaign.mailer.approved = true;
        }

        await campaign.save();
        res.json({ success: true, approveType });
    } catch (err) {
        console.error('[Retention] Approve error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/send — Node 5: Send emails
// ══════════════════════════════════════════════════════════════
router.post('/:id/send', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        // Ensure both creative and mailer are approved
        if (!campaign.mailer.approved) {
            return res.status(400).json({ success: false, error: 'Mailer must be approved before sending' });
        }

        const state = {
            brandId: campaign.brand,
            userId: req.user._id,
            contacts: campaign.contacts,
            creative: campaign.creative,
            mailer: campaign.mailer,
        };

        const result = await runNode('send', state);

        campaign.contacts = result.contacts;
        campaign.sendResults = result.sendResults;
        campaign.currentNode = 'complete';
        campaign.status = 'sent';
        await campaign.save();

        res.json({
            success: true,
            sendResults: result.sendResults,
        });
    } catch (err) {
        console.error('[Retention] Send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// GET /campaigns/:id/preview — Get email preview with real data
// ══════════════════════════════════════════════════════════════
router.get('/:id/preview', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const brand = await Brand.findById(campaign.brand).lean();
        // Use first matched contact for preview, or first contact
        const sampleContact = campaign.contacts?.find(c => c.matched) || campaign.contacts?.[0] || {};

        const creativeHtml = campaign.creative?.generatedHtml || '';
        const mailerBodyHtml = campaign.mailer?.bodyHtml || '';
        const subjectLine = campaign.mailer?.subjectLine || '';

        // Substitute placeholders
        const personalizedCreative = substituteTemplate(creativeHtml, sampleContact, brand);
        let personalizedMailer = mailerBodyHtml.replaceAll('{{creativeBlock}}', personalizedCreative);
        personalizedMailer = substituteTemplate(personalizedMailer, sampleContact, brand);
        const personalizedSubject = substituteTemplate(subjectLine, sampleContact, brand);

        res.json({
            success: true,
            preview: {
                subjectLine: personalizedSubject,
                previewText: substituteTemplate(campaign.mailer?.previewText || '', sampleContact, brand),
                bodyHtml: personalizedMailer,
                creativeHtml: personalizedCreative,
                sampleContact: {
                    name: sampleContact.name,
                    email: sampleContact.email,
                    amazonProductTitle: sampleContact.amazonProductTitle,
                    amazonPrice: sampleContact.amazonPrice,
                    shopifyProductTitle: sampleContact.shopifyProductTitle,
                    shopifyPrice: sampleContact.shopifyPrice,
                    savingsPercent: sampleContact.savingsPercent,
                },
            },
        });
    } catch (err) {
        console.error('[Retention] Preview error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/test-email — Send a test email
// ══════════════════════════════════════════════════════════════
router.post('/:id/test-email', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const { testEmail } = req.body;
        if (!testEmail) return res.status(400).json({ success: false, error: 'testEmail is required' });

        const brand = await Brand.findById(campaign.brand).lean();
        const sampleContact = campaign.contacts?.find(c => c.matched) || campaign.contacts?.[0] || {};

        const creativeHtml = campaign.creative?.generatedHtml || '';
        const mailerBodyHtml = campaign.mailer?.bodyHtml || '';

        // Substitute all placeholders
        const personalizedCreative = substituteTemplate(creativeHtml, sampleContact, brand);
        let personalizedMailer = mailerBodyHtml.replaceAll('{{creativeBlock}}', personalizedCreative);
        personalizedMailer = substituteTemplate(personalizedMailer, sampleContact, brand);
        const personalizedSubject = substituteTemplate(
            campaign.mailer?.subjectLine || `Great news from ${brand?.name || 'us'}!`,
            sampleContact,
            brand
        );

        // Send test email using retention mailer
        await sendRetentionEmail({
            to: testEmail,
            subject: `[TEST] ${personalizedSubject}`,
            html: personalizedMailer,
        });

        res.json({ success: true, message: `Test email sent to ${testEmail}` });
    } catch (err) {
        console.error('[Retention] Test email error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// POST /campaigns/:id/generate-image — Generate product comparison image
// ══════════════════════════════════════════════════════════════
router.post('/:id/generate-image', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const brand = await Brand.findById(campaign.brand).lean();
        const sampleContact = campaign.contacts?.find(c => c.matched) || campaign.contacts?.[0] || {};

        // Use Gemini to generate a product price comparison image
        const { getRouter } = await import('../ai/router.js');
        const router_ai = getRouter();

        const brandColors = brand?.dna?.visualIdentity?.colors || {};
        const primaryColor = brandColors.primary || '#6366f1';
        const bgColor = brandColors.background || '#0f0f23';

        const imagePrompt = `Create a clean, modern email-ready product price comparison banner image.

Product: "${sampleContact.shopifyProductTitle || sampleContact.amazonProductTitle || 'Premium Product'}"
Brand: "${brand?.name || 'Our Store'}"

Layout:
- Side by side comparison: Amazon vs ${brand?.name || 'Our Store'}
- Left side: Amazon price ₹${sampleContact.amazonPrice || 999} with strikethrough
- Right side: Our price ₹${sampleContact.shopifyPrice || 799} highlighted in green
- Large savings badge: "SAVE ₹${sampleContact.priceDelta || 200} (${sampleContact.savingsPercent || 20}% OFF)"
- Product image placeholder in center
- CTA: "Shop Direct & Save"

Style:
- Clean modern design with gradients
- Primary brand color: ${primaryColor}
- Dark premium background: ${bgColor}
- Professional e-commerce marketing style
- 600x300px banner ratio
- Bold typography, high contrast
- No blurry text, all text must be crisp and readable`;

        const result = await router_ai.generateImage({
            prompt: imagePrompt,
            aspectRatio: '2:1',
        });

        if (result?.imageUrl || result?.url) {
            const imageUrl = result.imageUrl || result.url;

            // Store in campaign creative
            campaign.creative.previewImageUrl = imageUrl;
            await campaign.save();

            res.json({
                success: true,
                imageUrl,
                message: 'Product comparison image generated',
            });
        } else {
            res.status(500).json({ success: false, error: 'Image generation returned no URL' });
        }
    } catch (err) {
        console.error('[Retention] Image generation error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ══════════════════════════════════════════════════════════════
// GET /email-status — Check if email sending is configured
// ══════════════════════════════════════════════════════════════
router.get('/email-status', protect, (req, res) => {
    res.json({ success: true, configured: isEmailConfigured() });
});


// ══════════════════════════════════════════════════════════════
// GET /pipeline — Get pipeline info (node names, order)
// ══════════════════════════════════════════════════════════════
router.get('/pipeline', protect, (req, res) => {
    res.json({ success: true, pipeline: getPipelineInfo() });
});


// ══════════════════════════════════════════════════════════════
// GET /campaigns/:id/analytics — Campaign analytics
// ══════════════════════════════════════════════════════════════
router.get('/:id/analytics', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const contacts = campaign.contacts || [];
        const matched = contacts.filter(c => c.matched);
        const sent = contacts.filter(c => c.emailStatus !== 'pending');
        const opened = contacts.filter(c => c.emailStatus === 'opened' || c.emailStatus === 'clicked');
        const clicked = contacts.filter(c => c.emailStatus === 'clicked');

        res.json({
            success: true,
            analytics: {
                totalContacts: contacts.length,
                totalMatched: matched.length,
                matchRate: contacts.length > 0 ? Math.round((matched.length / contacts.length) * 100) : 0,
                totalSent: sent.length,
                totalOpened: opened.length,
                totalClicked: clicked.length,
                openRate: sent.length > 0 ? Math.round((opened.length / sent.length) * 100) : 0,
                clickRate: sent.length > 0 ? Math.round((clicked.length / sent.length) * 100) : 0,
                avgSavings: campaign.matchResults?.avgSavings || 0,
                pipelineStatus: campaign.status,
                currentNode: campaign.currentNode,
            },
        });
    } catch (err) {
        console.error('[Retention] Analytics error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: RFM Segmentation
// ═══════════════════════════════════════════════════════════════

// GET /rfm?brandId=xxx — Run RFM analysis for a brand
router.get('/rfm', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const analysis = await runRFMAnalysis(brandId);
        const recommendations = getSegmentRecommendations();

        // Attach recommendations to segments
        for (const [key, seg] of Object.entries(analysis.segments)) {
            seg.recommendation = recommendations[key] || null;
        }

        res.json({
            success: true,
            totalCustomers: analysis.totalCustomers,
            segments: analysis.segments,
            analyzedAt: analysis.analyzedAt,
        });
    } catch (err) {
        console.error('[Retention] RFM error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /rfm/:segment?brandId=xxx — Get customers in a specific RFM segment
router.get('/rfm/:segment', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await getSegmentCustomers(brandId, req.params.segment, {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Segment detail error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: Win-Back Candidates
// ═══════════════════════════════════════════════════════════════

router.get('/winback', protect, async (req, res) => {
    try {
        const { brandId, inactiveDays } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await findWinBackCandidates(brandId, {
            inactiveDays: parseInt(inactiveDays) || 60,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Win-back error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: Price Drop Products
// ═══════════════════════════════════════════════════════════════

router.get('/price-drops', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await findPriceDropProducts(brandId);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Price drops error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: Post-Purchase — Recent Buyers
// ═══════════════════════════════════════════════════════════════

router.get('/recent-buyers', protect, async (req, res) => {
    try {
        const { brandId, daysBack } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await findRecentBuyers(brandId, {
            daysBack: parseInt(daysBack) || 7,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Recent buyers error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: A/B Testing
// ═══════════════════════════════════════════════════════════════

// POST /campaigns/:id/ab-test — Create A/B test for a campaign
router.post('/:id/ab-test', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const { variants } = req.body;
        if (!variants || variants.length < 2) {
            return res.status(400).json({ success: false, error: 'At least 2 variants required' });
        }

        const abTest = createABTest(campaign, variants);
        campaign.abTest = abTest;
        await campaign.save();

        res.json({ success: true, abTest });
    } catch (err) {
        console.error('[Retention] A/B test error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /campaigns/:id/ab-results — Get A/B test results
router.get('/:id/ab-results', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        if (!campaign.abTest) {
            return res.status(400).json({ success: false, error: 'No A/B test found for this campaign' });
        }

        const results = calculateABResults(campaign.abTest);
        res.json({ success: true, abTest: results });
    } catch (err) {
        console.error('[Retention] A/B results error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /campaigns/:id/utm — Get UTM params for a campaign
router.get('/:id/utm', protect, async (req, res) => {
    try {
        const campaign = await RetentionCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const utm = generateCampaignUTM(campaign);
        res.json({ success: true, utm });
    } catch (err) {
        console.error('[Retention] UTM error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 1: Flow Templates
// ═══════════════════════════════════════════════════════════════

// GET /templates — List all flow templates
router.get('/templates', protect, (req, res) => {
    const templates = getAllTemplates();
    res.json({ success: true, templates });
});

// GET /templates/categories — Templates grouped by category
router.get('/templates/categories', protect, (req, res) => {
    const categories = getTemplatesByCategory();
    res.json({ success: true, categories });
});

// GET /templates/:id — Get full template with steps
router.get('/templates/:id', protect, (req, res) => {
    const template = getTemplate(req.params.id);
    if (!template) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, template });
});


// ═══════════════════════════════════════════════════════════════
// PHASE 2: Unified Contacts & Dedup
// ═══════════════════════════════════════════════════════════════

// GET /contacts/unified?brandId=xxx — Merged contacts from all sources
router.get('/contacts/unified', protect, async (req, res) => {
    try {
        const { brandId, limit, offset } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await getUnifiedContacts(brandId, {
            limit: parseInt(limit) || 200,
            offset: parseInt(offset) || 0,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Unified contacts error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /contacts/duplicates?brandId=xxx — Find duplicate contacts
router.get('/contacts/duplicates', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await findDuplicates(brandId);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Duplicates error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /contacts/marketable?brandId=xxx — Marketable contacts only
router.get('/contacts/marketable', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const result = await getMarketableContacts(brandId);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Marketable contacts error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 2: SMS Provider
// ═══════════════════════════════════════════════════════════════

// GET /sms/status — Check SMS provider status
router.get('/sms/status', protect, (req, res) => {
    res.json({ success: true, sms: getSMSProviderInfo() });
});

// POST /sms/send — Send a single SMS
router.post('/sms/send', protect, async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) return res.status(400).json({ success: false, error: 'to and message required' });

        const result = await sendSMS(to, message);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] SMS send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /sms/bulk — Send bulk SMS
router.post('/sms/bulk', protect, async (req, res) => {
    try {
        const { recipients, message } = req.body;
        if (!recipients?.length || !message) {
            return res.status(400).json({ success: false, error: 'recipients array and message required' });
        }

        const result = await sendBulkSMS(recipients, message);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Bulk SMS error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ═══════════════════════════════════════════════════════════════
// PHASE 3: Push Notifications
// ═══════════════════════════════════════════════════════════════

// GET /push/status — Push provider info
router.get('/push/status', protect, (req, res) => {
    res.json({ success: true, push: getPushProviderInfo() });
});

// POST /push/send — Send single push notification
router.post('/push/send', protect, async (req, res) => {
    try {
        const { token, title, body, icon, image, url, data } = req.body;
        if (!token || !title) return res.status(400).json({ success: false, error: 'token and title required' });

        const result = await sendPush(token, { title, body, icon, image, url, data });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Push send error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /push/bulk — Send bulk push
router.post('/push/bulk', protect, async (req, res) => {
    try {
        const { tokens, title, body, icon, image, url, data } = req.body;
        if (!tokens?.length || !title) return res.status(400).json({ success: false, error: 'tokens and title required' });

        const result = await sendBulkPush(tokens, { title, body, icon, image, url, data });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Bulk push error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /push/topic — Send to FCM topic
router.post('/push/topic', protect, async (req, res) => {
    try {
        const { topic, title, body, data } = req.body;
        if (!topic || !title) return res.status(400).json({ success: false, error: 'topic and title required' });

        const result = await sendToTopic(topic, { title, body, data });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Topic push error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /push/subscribe — Subscribe tokens to a topic
router.post('/push/subscribe', protect, async (req, res) => {
    try {
        const { tokens, topic } = req.body;
        if (!tokens || !topic) return res.status(400).json({ success: false, error: 'tokens and topic required' });

        const result = await subscribeToTopic(tokens, topic);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Subscribe error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /push/service-worker — Firebase Messaging service worker code
router.get('/push/service-worker', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(getServiceWorkerCode());
});


// ═══════════════════════════════════════════════════════════════
// PHASE 3: Embeddable Lead Form
// ═══════════════════════════════════════════════════════════════

// GET /widget.js?brand=xxx — Serve the embeddable widget script (PUBLIC, no auth)
router.get('/widget.js', (req, res) => {
    const brandId = req.query.brand;
    if (!brandId) return res.status(400).send('// Error: brand query param required');

    const script = generateWidgetScript(brandId);
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(script);
});

// POST /leads — Capture lead from widget (PUBLIC, no auth)
router.post('/leads', async (req, res) => {
    try {
        const { brandId, email, name, phone, source, tags, pageUrl } = req.body;
        if (!brandId || !email) {
            return res.status(400).json({ success: false, error: 'brandId and email required' });
        }

        // Import Contact model dynamically to avoid circular deps
        const Contact = (await import('../models/Contact.js')).default;

        // Upsert contact — don't duplicate
        const contact = await Contact.findOneAndUpdate(
            { brand: brandId, email: email.toLowerCase().trim() },
            {
                $set: {
                    email: email.toLowerCase().trim(),
                    name: name || '',
                    phone: phone || '',
                    platform: 'web_form',
                    source: source || 'widget',
                    location: pageUrl || '',
                },
                $addToSet: { tags: { $each: tags || ['lead_form'] } },
                $setOnInsert: {
                    brand: brandId,
                    leadStatus: 'new',
                    interestScore: 10,
                },
            },
            { upsert: true, returnDocument: 'after' }
        );

        console.log(`📋 Lead captured: ${email} via ${source || 'widget'}`);
        res.json({ success: true, contactId: contact._id });
    } catch (err) {
        console.error('[Retention] Lead capture error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /widget/config — Widget configuration options
router.get('/widget/config', protect, (req, res) => {
    res.json({ success: true, options: getWidgetOptions() });
});

// GET /widget/embed?brandId=xxx — Get embed snippet
router.get('/widget/embed', protect, (req, res) => {
    const { brandId } = req.query;
    if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });
    res.json({ success: true, snippet: getEmbedSnippet(brandId) });
});


// ═══════════════════════════════════════════════════════════════
// PHASE 3: Browse Abandonment Tracking
// ═══════════════════════════════════════════════════════════════

// POST /track — Receive browse events from tracking pixel (PUBLIC, no auth)
router.post('/track', (req, res) => {
    try {
        const result = trackPageView(req.body);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(200).json({ success: false }); // Never fail on tracking
    }
});

// GET /track/pixel.js?brand=xxx — Serve the tracking pixel script (PUBLIC)
router.get('/track/pixel.js', (req, res) => {
    const brandId = req.query.brand;
    if (!brandId) return res.status(400).send('// Error: brand query param required');

    const script = generateTrackingScript(brandId);
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(script);
});

// GET /track/candidates?brandId=xxx — Browse abandonment candidates
router.get('/track/candidates', protect, async (req, res) => {
    try {
        const { minViews, inactiveMinutes } = req.query;
        const result = getAbandonmentCandidates({
            minViews: parseInt(minViews) || 2,
            inactiveMinutes: parseInt(inactiveMinutes) || 30,
        });
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Retention] Abandonment candidates error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /track/stats — Browse tracker stats
router.get('/track/stats', protect, (req, res) => {
    res.json({ success: true, stats: getTrackerStats() });
});


export default router;
