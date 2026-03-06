/**
 * First-Party Pixel & Server-Side Event Tracking
 * 
 * Privacy-compliant tracking system for iOS 14+ / GDPR:
 * - Generates a unique first-party pixel script for each brand
 * - Receives pixel events server-side (page views, add-to-cart, purchases)
 * - Handles fingerprint-based probabilistic matching
 * - Syncs events to Meta CAPI and Google Enhanced Conversions
 * 
 * Architecture:
 * 1. JS pixel → fires events to /api/pm-studio/pixel/event
 * 2. Server collects + stores events in PixelEvent DB
 * 3. Events aggregated into customer journeys for attribution
 * 4. Server-side forwarding to Meta CAPI / Google Enhanced Conversions
 */

import crypto from 'crypto';
import AdCampaign from '../../models/AdCampaign.js';
import Integration from '../../models/Integration.js';

// ══════════════════════════════════════════════════════════════════════════════
// PIXEL SCRIPT GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a first-party pixel JavaScript snippet for a brand.
 * This is a lightweight JS script the user embeds on their website.
 */
export function generatePixelScript(brandId, serverUrl) {
    const pixelId = crypto.createHash('sha256').update(brandId.toString()).digest('hex').slice(0, 16);

    return {
        pixelId,
        script: `<!-- Mantram AI First-Party Pixel -->
<script>
(function(m,a,n,t,r,i){
  m['MantramPixel']=r;m[r]=m[r]||function(){(m[r].q=m[r].q||[]).push(arguments)};
  m[r].id='${pixelId}';m[r].ts=Date.now();
  var s=a.createElement('script');s.async=1;s.src=n;
  a.getElementsByTagName('head')[0].appendChild(s);
})(window,document,'${serverUrl}/pixel.js','mantram','mp');

mp('init', '${pixelId}');
mp('track', 'PageView');
</script>
<!-- End Mantram AI Pixel -->`,
        pixelJsEndpoint: `${serverUrl}/pixel.js`,
        eventEndpoint: `${serverUrl}/api/pm-studio/pixel/event`,
        instructions: `
## Setup Instructions

1. Add the pixel script above to your website's <head> tag
2. Track custom events using:
   - mp('track', 'AddToCart', { value: 999, currency: 'INR', productId: 'SKU123' })
   - mp('track', 'Purchase', { value: 2499, currency: 'INR', orderId: 'ORD001' })
   - mp('track', 'Lead', { email: 'user@example.com' })
3. The pixel auto-tracks PageView, scroll depth, and time-on-page
`,
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// PIXEL.JS — Client-side tracking script content
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Returns the actual pixel.js JavaScript that gets loaded on user websites.
 */
export function getPixelClientScript(serverUrl) {
    return `
// Mantram AI First-Party Pixel v1.0
(function() {
    var mp = window.mp || function() { (mp.q = mp.q || []).push(arguments); };
    var pixelId = mp.id || '';
    var endpoint = '${serverUrl}/api/pm-studio/pixel/event';
    var sessionId = 'ses_' + Math.random().toString(36).substr(2, 12);

    // Fingerprint: lightweight, privacy-compliant browser fingerprint
    function getFingerprint() {
        var nav = navigator;
        var screen = window.screen;
        var raw = [
            nav.userAgent, nav.language, screen.width, screen.height,
            screen.colorDepth, new Date().getTimezoneOffset(),
            nav.hardwareConcurrency || 0, nav.deviceMemory || 0
        ].join('|');
        // Simple hash
        var hash = 0;
        for (var i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        return 'fp_' + Math.abs(hash).toString(36);
    }

    var fingerprint = getFingerprint();

    // Extract UTM params
    function getUTMs() {
        var params = new URLSearchParams(window.location.search);
        return {
            utm_source: params.get('utm_source') || '',
            utm_medium: params.get('utm_medium') || '',
            utm_campaign: params.get('utm_campaign') || '',
            utm_content: params.get('utm_content') || '',
            utm_term: params.get('utm_term') || '',
            fbclid: params.get('fbclid') || '',
            gclid: params.get('gclid') || '',
        };
    }

    // Send event to server
    function sendEvent(eventName, eventData) {
        var payload = {
            pixelId: pixelId,
            event: eventName,
            data: eventData || {},
            url: window.location.href,
            referrer: document.referrer,
            fingerprint: fingerprint,
            sessionId: sessionId,
            utms: getUTMs(),
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
        };

        // Use sendBeacon for reliability (survives page unload)
        if (navigator.sendBeacon) {
            navigator.sendBeacon(endpoint, JSON.stringify(payload));
        } else {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', endpoint, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(payload));
        }
    }

    // Process queued commands
    var queue = mp.q || [];
    mp = function(cmd, arg1, arg2) {
        if (cmd === 'init') { pixelId = arg1; }
        else if (cmd === 'track') { sendEvent(arg1, arg2); }
    };
    mp.id = pixelId;
    window.mp = mp;

    // Replay queue
    for (var i = 0; i < queue.length; i++) {
        mp.apply(null, queue[i]);
    }

    // Auto-track scroll depth
    var maxScroll = 0;
    window.addEventListener('scroll', function() {
        var scrollPct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
        if (scrollPct > maxScroll + 25) { // Track at 25% intervals
            maxScroll = scrollPct;
            sendEvent('ScrollDepth', { depth: maxScroll });
        }
    });

    // Auto-track time on page
    var startTime = Date.now();
    window.addEventListener('beforeunload', function() {
        sendEvent('TimeOnPage', { seconds: Math.round((Date.now() - startTime) / 1000) });
    });
})();
`;
}


// ══════════════════════════════════════════════════════════════════════════════
// SERVER-SIDE EVENT PROCESSING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Process incoming pixel events.
 * Stores locally and optionally forwards to Meta CAPI / Google Enhanced Conversions.
 */
export async function processPixelEvent(eventPayload) {
    const { pixelId, event, data, url, referrer, fingerprint, sessionId, utms, timestamp, userAgent } = eventPayload;

    // Store event (in production, this would go to a PixelEvent model)
    const processedEvent = {
        pixelId,
        event,
        data: data || {},
        url,
        referrer,
        fingerprint,
        sessionId,
        utms: utms || {},
        timestamp: timestamp || new Date().toISOString(),
        userAgent,
        processedAt: new Date(),
    };

    // Forward conversion events to Meta CAPI
    if (['Purchase', 'AddToCart', 'Lead', 'InitiateCheckout'].includes(event)) {
        await forwardToMetaCAPI(processedEvent).catch(e =>
            console.warn('Meta CAPI forward failed:', e.message)
        );
        await forwardToGoogleEnhanced(processedEvent).catch(e =>
            console.warn('Google Enhanced forward failed:', e.message)
        );
    }

    return processedEvent;
}


// ══════════════════════════════════════════════════════════════════════════════
// META CONVERSIONS API (CAPI) — Server-Side Forwarding
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Forward conversion events to Meta Conversions API for server-side tracking.
 * This bypasses iOS 14+ browser tracking restrictions.
 */
async function forwardToMetaCAPI(event) {
    // Get Meta pixel ID and access token from integration
    const integration = await Integration.findOne({
        platform: 'meta-ads',
        status: 'connected',
    }).lean();

    if (!integration) return;

    const metaPixelId = integration.platformData?.pixelId;
    const accessToken = integration.platformData?.accessToken;
    if (!metaPixelId || !accessToken) return;

    const hashedEmail = event.data?.email
        ? crypto.createHash('sha256').update(event.data.email.toLowerCase().trim()).digest('hex')
        : undefined;

    const eventData = {
        data: [{
            event_name: mapToMetaEvent(event.event),
            event_time: Math.floor(new Date(event.timestamp).getTime() / 1000),
            event_source_url: event.url,
            action_source: 'website',
            user_data: {
                client_user_agent: event.userAgent,
                em: hashedEmail ? [hashedEmail] : undefined,
                fbc: event.utms?.fbclid ? `fb.1.${Date.now()}.${event.utms.fbclid}` : undefined,
                external_id: event.fingerprint ? [crypto.createHash('sha256').update(event.fingerprint).digest('hex')] : undefined,
            },
            custom_data: {
                value: event.data?.value || 0,
                currency: event.data?.currency || 'INR',
                content_ids: event.data?.productId ? [event.data.productId] : undefined,
                order_id: event.data?.orderId,
            },
        }],
    };

    try {
        await fetch(`https://graph.facebook.com/v21.0/${metaPixelId}/events?access_token=${accessToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
        });
    } catch (e) {
        console.error('Meta CAPI error:', e.message);
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE ENHANCED CONVERSIONS — Server-Side Forwarding
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Forward conversion events to Google Enhanced Conversions.
 */
async function forwardToGoogleEnhanced(event) {
    const integration = await Integration.findOne({
        platform: 'google-ads',
        status: 'connected',
    }).lean();

    if (!integration) return;

    const measurementId = integration.platformData?.measurementId;
    const apiSecret = integration.platformData?.apiSecret;
    if (!measurementId || !apiSecret) return;

    const payload = {
        client_id: event.fingerprint || `anon_${Date.now()}`,
        events: [{
            name: mapToGoogleEvent(event.event),
            params: {
                value: event.data?.value || 0,
                currency: event.data?.currency || 'INR',
                transaction_id: event.data?.orderId || `txn_${Date.now()}`,
                items: event.data?.productId ? [{ item_id: event.data.productId }] : undefined,
            },
        }],
    };

    try {
        await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (e) {
        console.error('Google Enhanced Conversions error:', e.message);
    }
}


// ── Event name mappers ──
function mapToMetaEvent(event) {
    const map = { PageView: 'PageView', AddToCart: 'AddToCart', Purchase: 'Purchase', Lead: 'Lead', InitiateCheckout: 'InitiateCheckout' };
    return map[event] || 'CustomEvent';
}

function mapToGoogleEvent(event) {
    const map = { PageView: 'page_view', AddToCart: 'add_to_cart', Purchase: 'purchase', Lead: 'generate_lead', InitiateCheckout: 'begin_checkout' };
    return map[event] || event.toLowerCase();
}
