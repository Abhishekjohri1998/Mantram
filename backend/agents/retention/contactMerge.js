/**
 * Retention Studio — Contact Merge / Dedup Service
 * 
 * Merges contacts from multiple sources (Contact, ShopifyCustomer, RetentionCampaign)
 * into a unified view and deduplicates by email.
 */

import Contact from '../../models/Contact.js';
import ShopifyCustomer from '../../models/ShopifyCustomer.js';
import RetentionCampaign from '../../models/RetentionCampaign.js';

/**
 * Build a unified contact list from all sources for a brand.
 * Merges by email, aggregating data from Contact, ShopifyCustomer, and RetentionCampaign.
 */
export async function getUnifiedContacts(brandId, { limit = 200, offset = 0, filter = {} } = {}) {
    // 1. Get contacts from Contact model
    const contacts = await Contact.find({ brand: brandId, ...filter })
        .sort({ lastInteractionAt: -1 })
        .lean();

    // 2. Get Shopify customers
    const shopifyCustomers = await ShopifyCustomer.find({ brand: brandId })
        .sort({ totalSpent: -1 })
        .lean();

    // 3. Merge by email
    const emailMap = new Map();

    for (const c of contacts) {
        const email = (c.email || '').toLowerCase().trim();
        if (!email) continue;
        if (!emailMap.has(email)) {
            emailMap.set(email, {
                email,
                name: c.name || 'Unknown',
                phone: c.phone || '',
                sources: [],
                tags: [...(c.tags || [])],
                leadStatus: c.leadStatus || 'new',
                interestScore: c.interestScore || 0,
                totalMessages: c.totalMessages || 0,
                lastInteractionAt: c.lastInteractionAt,
                optedOut: c.optedOut || false,
                location: c.location || '',
                platform: c.platform || '',
                shopify: null,
                contactId: c._id,
            });
        }
        emailMap.get(email).sources.push('contact');
    }

    for (const sc of shopifyCustomers) {
        const email = (sc.email || '').toLowerCase().trim();
        if (!email) continue;
        if (!emailMap.has(email)) {
            emailMap.set(email, {
                email,
                name: `${sc.firstName || ''} ${sc.lastName || ''}`.trim() || 'Unknown',
                phone: sc.phone || '',
                sources: [],
                tags: [...(sc.tags || [])],
                leadStatus: sc.ordersCount > 0 ? 'converted' : 'new',
                interestScore: 0,
                totalMessages: 0,
                lastInteractionAt: null,
                optedOut: false,
                location: sc.defaultAddress?.city || '',
                platform: 'shopify',
                contactId: null,
            });
        }
        const unified = emailMap.get(email);
        unified.sources.push('shopify');
        unified.shopify = {
            customerId: sc._id,
            shopifyCustomerId: sc.shopifyCustomerId,
            ordersCount: sc.ordersCount,
            totalSpent: sc.totalSpent,
            acceptsMarketing: sc.acceptsMarketing,
            city: sc.defaultAddress?.city,
        };
        // Enrich from Shopify if missing
        if (!unified.phone && sc.phone) unified.phone = sc.phone;
        if (unified.name === 'Unknown' && sc.firstName) {
            unified.name = `${sc.firstName} ${sc.lastName || ''}`.trim();
        }
        // Merge tags
        for (const tag of (sc.tags || [])) {
            if (!unified.tags.includes(tag)) unified.tags.push(tag);
        }
    }

    const all = Array.from(emailMap.values());

    return {
        contacts: all.slice(offset, offset + limit),
        total: all.length,
        sourceBreakdown: {
            contactOnly: all.filter(c => c.sources.length === 1 && c.sources[0] === 'contact').length,
            shopifyOnly: all.filter(c => c.sources.length === 1 && c.sources[0] === 'shopify').length,
            merged: all.filter(c => c.sources.length > 1).length,
        },
    };
}

/**
 * Find duplicate contacts (same email across sources)
 */
export async function findDuplicates(brandId) {
    const { contacts } = await getUnifiedContacts(brandId, { limit: 10000 });
    const duplicates = contacts.filter(c => c.sources.length > 1);

    return {
        duplicates,
        total: duplicates.length,
        suggestion: duplicates.length > 0
            ? `Found ${duplicates.length} contacts that exist in multiple sources. These can be auto-merged.`
            : 'No duplicate contacts found across sources.',
    };
}

/**
 * Get marketable contacts (opted-in, has email, not opted out)
 */
export async function getMarketableContacts(brandId) {
    const { contacts } = await getUnifiedContacts(brandId, { limit: 10000 });
    const marketable = contacts.filter(c => {
        if (c.optedOut) return false;
        if (c.shopify && c.shopify.acceptsMarketing === false) return false;
        return true;
    });

    return {
        contacts: marketable,
        total: marketable.length,
        withPhone: marketable.filter(c => c.phone).length,
        withShopify: marketable.filter(c => c.shopify).length,
    };
}
