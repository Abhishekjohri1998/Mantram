/**
 * Funnel Webhooks — Public endpoints for external system integration
 * #4 Webhook Ingest — Accept data from Shopify, Stripe, forms, Zapier, etc.
 */

import { Router } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Contact from '../models/Contact.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { runAutomationRules } from './funnel-automation.js';
import config from '../config/env.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');


// ═══════════════════════════════════════════════════════════════
//  WEBHOOK INGEST — Public endpoint (no auth required)
//  URL: POST /api/funnel-webhooks/:webhookToken/ingest
// ═══════════════════════════════════════════════════════════════

router.post('/:webhookToken/ingest', async (req, res) => {
    try {
        const { webhookToken } = req.params;

        // Find funnel by webhook token
        const funnel = await Funnel.findOne({ webhookToken });
        if (!funnel) return res.status(404).json({ success: false, error: 'Invalid webhook token' });

        const { name, email, phone, company, source: rawSource, stage, dealValue, tags, metadata } = req.body;

        // Validate source against FunnelEntry enum
        const VALID_SOURCES = ['ad', 'seo', 'social', 'dm', 'direct', 'referral', 'email', 'shopify', 'linkedin', 'website', 'telephonic', 'manual', 'other'];
        const source = VALID_SOURCES.includes(rawSource) ? rawSource : 'other';

        if (!name && !email) {
            return res.status(400).json({ success: false, error: 'At least name or email required' });
        }

        const targetStage = stage || funnel.stages[0]?.name || 'Lead';

        // Check if contact already exists (by email)
        let existingEntry = null;
        if (email) {
            existingEntry = await FunnelEntry.findOne({ funnel: funnel._id, email: email.toLowerCase() });
        }

        if (existingEntry) {
            // Update existing entry with new data
            if (dealValue) existingEntry.dealValue = dealValue;
            if (tags?.length) existingEntry.tags = [...new Set([...existingEntry.tags, ...tags])];
            existingEntry.touchpoints.push({
                type: 'webhook',
                details: `Webhook update from ${source || 'external'}: ${metadata?.event || 'data sync'}`,
                timestamp: new Date(),
            });
            await existingEntry.save();

            return res.json({ success: true, action: 'updated', entryId: existingEntry._id });
        }

        // Create contact if it doesn't exist
        let contact = null;
        if (email) {
            // Map source to Contact platform
            const platformMap = { website: 'website', social: 'instagram', linkedin: 'linkedin', email: 'email', telephonic: 'telephonic', whatsapp: 'whatsapp' };
            const contactPlatform = platformMap[source] || 'other';
            contact = await Contact.findOneAndUpdate(
                { user: funnel.user, brand: funnel.brand, platform: contactPlatform, platformUserId: email.toLowerCase() },
                {
                    $set: {
                        name: name || email.split('@')[0],
                        email: email.toLowerCase(),
                        phone: phone || '',
                    },
                    $addToSet: { funnelIds: funnel._id, ...(tags?.length ? { tags: { $each: tags } } : {}) },
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // Create funnel entry
        const entry = await FunnelEntry.create({
            funnel: funnel._id,
            user: funnel.user,
            brand: funnel.brand,
            contact: contact?._id,
            name: name || email,
            email: email,
            phone: phone || '',
            company: company || '',
            source: source || 'webhook',
            currentStage: targetStage,
            score: 10,
            dealValue: dealValue || 0,
            tags: tags || [],
            stageHistory: [{ stage: targetStage, enteredAt: new Date(), movedBy: 'webhook' }],
            touchpoints: [
                { type: 'webhook', details: `Created via webhook from ${source || 'external'}`, timestamp: new Date() },
                ...(metadata ? [{ type: 'custom', details: `Metadata: ${JSON.stringify(metadata).slice(0, 200)}`, timestamp: new Date() }] : []),
            ],
        });

        // Fire automation rules
        runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => { });

        res.status(201).json({ success: true, action: 'created', entryId: entry._id });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  SHOPIFY ORDER WEBHOOK — Accept Shopify order/paid events
// ═══════════════════════════════════════════════════════════════

router.post('/:webhookToken/shopify', async (req, res) => {
    try {
        const { webhookToken } = req.params;
        const funnel = await Funnel.findOne({ webhookToken });
        if (!funnel) return res.status(404).json({ success: false, error: 'Invalid webhook token' });

        // BUG-23 FIX: Verify Shopify HMAC signature
        const hmac = req.header('x-shopify-hmac-sha256');
        if (!hmac) return res.status(401).json({ success: false, error: 'No HMAC signature found' });

        const secret = config.shopify?.clientSecret || process.env.SHOPIFY_API_SECRET;
        if (secret) {
            const generatedHash = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('base64');
            if (generatedHash !== hmac) {
                return res.status(401).json({ success: false, error: 'Invalid HMAC signature' });
            }
        } else {
            console.warn('⚠️ SHOPIFY_API_SECRET not provided, skipping webhook verification for funnel ingest');
        }

        const event = req.headers['x-shopify-topic'] || 'orders/create';
        const body = req.body;

        // Extract customer info from Shopify payload
        const customer = body.customer || body.billing_address || {};
        const name = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || body.email;
        const email = body.email || customer.email;

        if (!email) return res.status(400).json({ success: false, error: 'No email in Shopify payload' });

        // Determine stage based on event
        let stage = funnel.stages[0]?.name || 'Lead';
        if (event.includes('paid') || event.includes('fulfilled')) {
            stage = funnel.stages[funnel.stages.length - 1]?.name || 'Customer';
        } else if (event.includes('create')) {
            stage = funnel.stages[Math.min(2, funnel.stages.length - 1)]?.name || 'Interested';
        }

        // Check for existing entry
        let entry = await FunnelEntry.findOne({ funnel: funnel._id, email: email.toLowerCase() });

        if (entry) {
            entry.dealValue = (entry.dealValue || 0) + parseFloat(body.total_price || 0);
            entry.touchpoints.push({
                type: 'purchase',
                details: `Shopify ${event}: Order #${body.order_number || body.id} — $${body.total_price || 0}`,
                timestamp: new Date(),
            });
            if (event.includes('paid')) entry.status = 'converted';
            await entry.save();
        } else {
            entry = await FunnelEntry.create({
                funnel: funnel._id, user: funnel.user, brand: funnel.brand,
                name, email: email.toLowerCase(), source: 'shopify',
                currentStage: stage, score: 30,
                dealValue: parseFloat(body.total_price || 0),
                stageHistory: [{ stage, enteredAt: new Date(), movedBy: 'shopify_webhook' }],
                touchpoints: [{ type: 'purchase', details: `Shopify ${event}: Order #${body.order_number || body.id}`, timestamp: new Date() }],
            });
            runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => { });
        }

        res.json({ success: true, entryId: entry._id });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  STRIPE PAYMENT WEBHOOK — Accept Stripe checkout/payment events
// ═══════════════════════════════════════════════════════════════

router.post('/:webhookToken/stripe', async (req, res) => {
    try {
        const { webhookToken } = req.params;
        const funnel = await Funnel.findOne({ webhookToken });
        if (!funnel) return res.status(404).json({ success: false, error: 'Invalid webhook token' });

        // BUG-24 FIX: Verify Stripe signature
        const sig = req.headers['stripe-signature'];
        if (!sig) return res.status(400).json({ success: false, error: 'No Stripe signature found' });

        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        let event = req.body;

        if (endpointSecret && req.rawBody) {
            try {
                event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
            } catch (err) {
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }
        } else if (!endpointSecret) {
            console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured, skipping verification for funnel ingest');
        }

        const eventType = event.type || 'payment_intent.succeeded';
        const data = event.data?.object || {};

        const email = data.receipt_email || data.customer_email || data.billing_details?.email;
        const name = data.billing_details?.name || data.customer_name || email;

        if (!email) return res.status(400).json({ success: false, error: 'No email in Stripe payload' });

        const amount = (data.amount || data.amount_total || 0) / 100; // cents to dollars

        let entry = await FunnelEntry.findOne({ funnel: funnel._id, email: email.toLowerCase() });

        if (entry) {
            entry.dealValue = (entry.dealValue || 0) + amount;
            entry.touchpoints.push({
                type: 'purchase',
                details: `Stripe ${eventType}: $${amount}`,
                timestamp: new Date(),
            });
            if (eventType.includes('succeeded') || eventType.includes('complete')) {
                entry.status = 'converted';
                entry.convertedAt = new Date();
            }
            await entry.save();
        } else {
            entry = await FunnelEntry.create({
                funnel: funnel._id, user: funnel.user, brand: funnel.brand,
                name, email: email.toLowerCase(), source: 'direct',
                currentStage: funnel.stages[funnel.stages.length - 1]?.name || 'Customer',
                score: 80, dealValue: amount, status: 'converted', convertedAt: new Date(),
                stageHistory: [{ stage: funnel.stages[funnel.stages.length - 1]?.name || 'Customer', enteredAt: new Date(), movedBy: 'stripe_webhook' }],
                touchpoints: [{ type: 'purchase', details: `Stripe payment: $${amount}`, timestamp: new Date() }],
            });
        }

        res.json({ success: true, entryId: entry._id });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
