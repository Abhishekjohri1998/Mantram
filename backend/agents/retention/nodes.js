/**
 * Retention Studio — Agent Nodes
 * 
 * 5-node pipeline: Ingest → Match → Creative → Compose → Send
 * Each node: (state) → updatedState
 */

import Brand from '../../models/Brand.js';
import Integration from '../../models/Integration.js';
import { getRouter } from '../../ai/router.js';
import { sendRetentionEmail } from './mailer.js';
import { buildRetentionBrandCtx, CREATIVE_DESIGN_PROMPT, MAILER_COMPOSE_PROMPT } from './prompts.js';

// ── Helper: Parse CSV text to contacts array ──
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map(h => h.trim().replace(/"/g, ''));

    // Map common header names
    const colMap = {};
    headers.forEach((h, i) => {
        if (/email/.test(h)) colMap.email = i;
        else if (/name|customer/.test(h)) colMap.name = i;
        else if (/address|city|state|zip|country/.test(h)) colMap.address = i;
        else if (/order.*id/.test(h)) colMap.amazonOrderId = i;
        else if (/product.*title|item.*name|product.*name/.test(h)) colMap.amazonProductTitle = i;
        else if (/asin/.test(h)) colMap.amazonASIN = i;
        else if (/price|amount|total/.test(h)) colMap.amazonPrice = i;
        else if (/date|order.*date/.test(h)) colMap.orderDate = i;
    });

    const contacts = [];
    const seen = new Set();

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
        const email = cols[colMap.email] || '';
        if (!email || seen.has(email.toLowerCase())) continue;
        seen.add(email.toLowerCase());

        contacts.push({
            email: email.toLowerCase(),
            name: cols[colMap.name] || '',
            address: cols[colMap.address] || '',
            amazonOrderId: cols[colMap.amazonOrderId] || '',
            amazonProductTitle: cols[colMap.amazonProductTitle] || '',
            amazonASIN: cols[colMap.amazonASIN] || '',
            amazonPrice: parseFloat(cols[colMap.amazonPrice]) || 0,
            orderDate: cols[colMap.orderDate] ? new Date(cols[colMap.orderDate]) : null,
        });
    }

    return contacts;
}

// ── Helper: Substitute {{placeholders}} in template HTML ──
export function substituteTemplate(html, contact, brand) {
    if (!html) return '';
    const map = {
        '{{name}}': contact.name || 'there',
        '{{firstName}}': (contact.name || '').split(' ')[0] || 'there',
        '{{email}}': contact.email || '',
        '{{productImage}}': contact.shopifyProductImage || '',
        '{{amazonProductTitle}}': contact.amazonProductTitle || 'Your Product',
        '{{shopifyProductTitle}}': contact.shopifyProductTitle || contact.amazonProductTitle || 'Product',
        '{{amazonPrice}}': String(contact.amazonPrice || 0),
        '{{shopifyPrice}}': String(contact.shopifyPrice || 0),
        '{{savingsAmount}}': String(contact.priceDelta || 0),
        '{{savingsPercent}}': String(contact.savingsPercent || 0),
        '{{priceDelta}}': String(contact.priceDelta || 0),
        '{{shopifyProductUrl}}': contact.shopifyProductUrl || brand?.website || '#',
        '{{ctaUrl}}': contact.shopifyProductUrl || brand?.website || '#',
        '{{brandName}}': brand?.name || 'Our Store',
        '{{websiteUrl}}': brand?.website || '#',
        '{{logoUrl}}': brand?.dna?.logo?.url || '',
        '{{creativeBlock}}': '', // handled separately
    };
    let result = html;
    for (const [key, val] of Object.entries(map)) {
        result = result.replaceAll(key, val);
    }
    return result;
}

// ── Helper: Call AI model ──
async function callAgent(systemPrompt, userPrompt, temperature = 0.7) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: 8192,
    }, { provider: 'google' }); // Use Gemini for creative tasks

    const text = result.text || '';
    try {
        let cleaned = text;
        // Strip <think>...</think> tags (Gemini 2.5 Flash reasoning)
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
        const lastThinkIdx = cleaned.lastIndexOf('<think>');
        if (lastThinkIdx !== -1) {
            const before = cleaned.substring(0, lastThinkIdx).trim();
            cleaned = before.length > 0 ? before : '';
        }
        // Strip markdown code fences
        cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '');
        cleaned = cleaned.trim();
        
        if (cleaned.startsWith('{')) {
            try { return JSON.parse(cleaned); } catch (_) { /* try next */ }
        }
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[0]); } catch (_) { /* try next */ }
            const fixed = jsonMatch[0].replace(/,\s*([\]}])/g, '$1').replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            try { return JSON.parse(fixed); } catch (_) { /* give up */ }
        }
    } catch (e) {
        console.warn('[Retention] AI JSON parse failed:', text.substring(0, 300));
    }
    return { error: 'Failed to parse AI response', raw: text.substring(0, 500) };
}

// ══════════════════════════════════════════════════════════════
// NODE 1: DATA INGEST — Parse CSV/paste data into contacts
// ══════════════════════════════════════════════════════════════
export async function dataIngestNode(state) {
    console.log('📥 Retention Node: Data Ingest — parsing contacts...');

    const rawData = state.input?.rawData || '';
    const source = state.input?.source || 'csv';

    let contacts = [];
    let duplicatesRemoved = 0;

    if (source === 'csv' || source === 'paste') {
        const allParsed = parseCSV(rawData);
        // Count duplicates (raw lines minus unique contacts)
        const rawLines = rawData.trim().split('\n').length - 1; // minus header
        duplicatesRemoved = Math.max(0, rawLines - allParsed.length);
        contacts = allParsed;
    }

    return {
        ...state,
        contacts,
        ingestData: {
            source,
            rawData: rawData.substring(0, 2000), // Store snippet only
            totalImported: contacts.length,
            duplicatesRemoved,
        },
        currentNode: 'match',
        status: 'matching',
    };
}

// ══════════════════════════════════════════════════════════════
// NODE 2: MATCH & ENRICH — Match Amazon products to Shopify catalog
// ══════════════════════════════════════════════════════════════
export async function matchEnrichNode(state) {
    console.log('🔗 Retention Node: Match & Enrich — matching products to Shopify...');

    const { brandId } = state;
    const contacts = state.contacts || [];

    // Load brand & Shopify integration
    const brand = await Brand.findById(brandId).lean();
    const integration = await Integration.findOne({
        user: state.userId,
        platform: 'shopify',
        status: 'active',
    }).lean();

    let shopifyProducts = [];

    // Try to fetch Shopify products if integration exists
    if (integration?.credentials?.shopDomain && integration?.credentials?.accessToken) {
        try {
            const { shopDomain, accessToken } = integration.credentials;
            const apiVersion = '2024-01';
            const url = `https://${shopDomain}/admin/api/${apiVersion}/products.json?limit=250&status=active`;
            const resp = await fetch(url, {
                headers: { 'X-Shopify-Access-Token': accessToken },
            });
            if (resp.ok) {
                const data = await resp.json();
                shopifyProducts = (data.products || []).map(p => ({
                    id: String(p.id),
                    title: p.title,
                    price: parseFloat(p.variants?.[0]?.price || 0),
                    url: `https://${shopDomain}/products/${p.handle}`,
                    image: p.images?.[0]?.src || '',
                    handle: p.handle,
                }));
            }
        } catch (err) {
            console.warn('[Retention] Shopify fetch failed:', err.message);
        }
    }

    // Fuzzy match each contact's Amazon product to Shopify catalog
    let totalMatched = 0;
    let totalSavings = 0;

    const enrichedContacts = contacts.map(contact => {
        if (!contact.amazonProductTitle || shopifyProducts.length === 0) {
            return contact;
        }

        // Simple fuzzy match: find Shopify product with highest title similarity
        const amazonTitle = contact.amazonProductTitle.toLowerCase();
        let bestMatch = null;
        let bestScore = 0;

        for (const sp of shopifyProducts) {
            const shopTitle = sp.title.toLowerCase();
            // Quick similarity: count shared words
            const amazonWords = amazonTitle.split(/\s+/).filter(w => w.length > 2);
            const shopWords = shopTitle.split(/\s+/).filter(w => w.length > 2);
            const shared = amazonWords.filter(w => shopWords.some(sw => sw.includes(w) || w.includes(sw)));
            const score = shared.length / Math.max(amazonWords.length, 1);

            if (score > bestScore && score >= 0.3) { // 30% word overlap threshold
                bestScore = score;
                bestMatch = sp;
            }
        }

        if (bestMatch && contact.amazonPrice > bestMatch.price) {
            const delta = contact.amazonPrice - bestMatch.price;
            totalMatched++;
            totalSavings += delta;
            return {
                ...contact,
                matched: true,
                shopifyProductId: bestMatch.id,
                shopifyProductTitle: bestMatch.title,
                shopifyPrice: bestMatch.price,
                shopifyProductUrl: bestMatch.url,
                shopifyProductImage: bestMatch.image,
                priceDelta: delta,
                savingsPercent: Math.round((delta / contact.amazonPrice) * 100),
            };
        }

        return contact;
    });

    return {
        ...state,
        contacts: enrichedContacts,
        matchResults: {
            totalMatched,
            totalUnmatched: contacts.length - totalMatched,
            avgSavings: totalMatched > 0 ? Math.round(totalSavings / totalMatched) : 0,
            matchedAt: new Date(),
        },
        currentNode: 'creative',
        status: 'designing',
    };
}

// ══════════════════════════════════════════════════════════════
// NODE 3: CREATIVE DESIGN — AI-generate price comparison card
// ══════════════════════════════════════════════════════════════
export async function creativeDesignNode(state) {
    console.log('🎨 Retention Node: Creative Design — generating comparison card...');

    const brand = await Brand.findById(state.brandId).lean();
    const brandContext = buildRetentionBrandCtx(brand);

    const templateType = state.input?.creativeTemplate || 'price-showdown';

    // Pick a sample contact for context
    const sampleContact = state.contacts?.find(c => c.matched) || state.contacts?.[0] || {};

    const userPrompt = `TEMPLATE TYPE: ${templateType}
SAMPLE PRODUCT:
  Amazon Product: "${sampleContact.amazonProductTitle || 'Sample Product'}"
  Amazon Price: ₹${sampleContact.amazonPrice || 999}
  Website Price: ₹${sampleContact.shopifyPrice || 799}
  Savings: ₹${sampleContact.priceDelta || 200} (${sampleContact.savingsPercent || 20}%)
  Product Image: ${sampleContact.shopifyProductImage || '{{productImage}}'}

BRAND USPs: ${brand?.dna?.uniqueSellingPoints?.join(', ') || 'Direct from brand, Free shipping, Genuine product'}

Generate the email-safe HTML creative card following the ${templateType} style.`;

    const result = await callAgent(
        CREATIVE_DESIGN_PROMPT(brandContext),
        userPrompt,
        0.8
    );

    return {
        ...state,
        creative: {
            templateType,
            generatedHtml: result.creativeHtml || result.html || '',
            previewImageUrl: '',
            aiPromptUsed: userPrompt.substring(0, 500),
            approved: false,
        },
        currentNode: 'compose',
        status: 'composing',
    };
}

// ══════════════════════════════════════════════════════════════
// NODE 4: MAILER COMPOSE — AI-generate complete email HTML
// ══════════════════════════════════════════════════════════════
export async function mailerComposeNode(state) {
    console.log('📧 Retention Node: Mailer Compose — generating full email...');

    const brand = await Brand.findById(state.brandId).lean();
    const brandContext = buildRetentionBrandCtx(brand);

    const templateType = state.input?.mailerTemplate || 'clean-minimal';

    const userPrompt = `MAILER TEMPLATE: ${templateType}
BRAND NAME: ${brand?.name || 'Our Store'}
WEBSITE: ${brand?.website || '{{websiteUrl}}'}
LOGO: ${brand?.dna?.logo?.url || '{{logoUrl}}'}

CREATIVE BLOCK (embed this in the email body):
${state.creative?.generatedHtml?.substring(0, 3000) || '{{creativeBlock}}'}

CAMPAIGN STATS:
  Total contacts: ${state.contacts?.length || 0}
  Matched products: ${state.matchResults?.totalMatched || 0}
  Average savings: ₹${state.matchResults?.avgSavings || 0}

SOCIAL LINKS:
  Instagram: ${brand?.dna?.socialLinks?.instagram || ''}
  Facebook: ${brand?.dna?.socialLinks?.facebook || ''}
  Twitter: ${brand?.dna?.socialLinks?.twitter || ''}

Generate a complete, production-ready HTML email in the ${templateType} style.
The email should convince Amazon customers to buy direct from the brand's website.`;

    const result = await callAgent(
        MAILER_COMPOSE_PROMPT(brandContext),
        userPrompt,
        0.7
    );

    return {
        ...state,
        mailer: {
            templateType,
            subjectLine: result.subjectLine || 'We have a better deal for you! 🎉',
            previewText: result.previewText || 'Same product, better price — direct from us',
            bodyHtml: result.bodyHtml || '',
            ctaText: result.ctaText || `Shop Now on ${brand?.name || 'our website'}`,
            ctaUrl: brand?.website || '',
            approved: false,
        },
        currentNode: 'send',
        status: 'reviewing',
    };
}

// ══════════════════════════════════════════════════════════════
// NODE 5: SEND & TRACK — Send real emails via Gmail SMTP
// ══════════════════════════════════════════════════════════════
export async function sendTrackNode(state) {
    console.log('📤 Retention Node: Send & Track — dispatching REAL emails...');

    const brand = await Brand.findById(state.brandId).lean();
    const matchedContacts = (state.contacts || []).filter(c => c.matched);

    // Build the creative block with per-contact data substitution
    const creativeHtml = state.creative?.generatedHtml || '';
    const mailerBodyHtml = state.mailer?.bodyHtml || '';
    const subjectLine = state.mailer?.subjectLine || `Great news from ${brand?.name || 'us'}!`;

    let totalSent = 0;
    let totalBounced = 0;
    const sentAt = new Date();

    // Send emails one by one with throttling
    for (const contact of matchedContacts) {
        try {
            // Substitute placeholders in creative block
            const personalizedCreative = substituteTemplate(creativeHtml, contact, brand);
            // Substitute placeholders in full mailer (including {{creativeBlock}})
            let personalizedMailer = mailerBodyHtml.replaceAll('{{creativeBlock}}', personalizedCreative);
            personalizedMailer = substituteTemplate(personalizedMailer, contact, brand);
            // Substitute subject line
            const personalizedSubject = substituteTemplate(subjectLine, contact, brand);

            await sendRetentionEmail({
                to: contact.email,
                subject: personalizedSubject,
                html: personalizedMailer,
            });

            contact.emailStatus = 'sent';
            contact.sentAt = sentAt;
            totalSent++;
            console.log(`  ✉️ Sent to ${contact.email}`);

            // Throttle: 200ms between sends to avoid rate limits
            if (matchedContacts.indexOf(contact) < matchedContacts.length - 1) {
                await new Promise(r => setTimeout(r, 200));
            }
        } catch (err) {
            console.error(`  ❌ Failed to send to ${contact.email}:`, err.message);
            contact.emailStatus = 'failed';
            totalBounced++;
        }
    }

    // Update all contacts (merge sent status back)
    const allContacts = state.contacts.map(c => {
        if (c.matched) {
            const sent = matchedContacts.find(sc => sc.email === c.email);
            return sent || c;
        }
        return c;
    });

    return {
        ...state,
        contacts: allContacts,
        sendResults: {
            totalSent,
            totalDelivered: totalSent, // Gmail SMTP = delivered on send
            totalOpened: 0,
            totalClicked: 0,
            totalBounced,
            openRate: 0,
            clickRate: 0,
            startedAt: sentAt,
            completedAt: new Date(),
        },
        currentNode: 'complete',
        status: 'sent',
    };
}
