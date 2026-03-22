/**
 * Push Notification Service — Retention Studio
 * 
 * Abstraction layer for web/mobile push notifications.
 * Supports Firebase Cloud Messaging (FCM) for both web push and mobile.
 * 
 * Setup:
 *   1. Create a Firebase project at console.firebase.google.com
 *   2. Download the service account JSON
 *   3. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_CONFIG in .env
 *   4. Set PUSH_PROVIDER=fcm in .env
 * 
 * For development: Runs in simulation mode by default.
 */

const PUSH_PROVIDER = process.env.PUSH_PROVIDER || 'none'; // 'fcm', 'onesignal', 'none'

// ── Firebase Config ──
const FIREBASE_CONFIG = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

let firebaseAdmin = null;

/**
 * Initialize Firebase Admin SDK (lazy init)
 */
async function getFirebaseAdmin() {
    if (firebaseAdmin) return firebaseAdmin;
    if (PUSH_PROVIDER !== 'fcm') return null;

    try {
        const admin = await import('firebase-admin');
        if (!admin.apps?.length) {
            admin.initializeApp({
                credential: FIREBASE_CONFIG
                    ? admin.credential.cert(FIREBASE_CONFIG)
                    : admin.credential.applicationDefault(),
            });
        }
        firebaseAdmin = admin;
        return admin;
    } catch (err) {
        console.warn('⚠️ Firebase Admin SDK not available:', err.message);
        return null;
    }
}

/**
 * Send a push notification to a single device
 * @param {string} token - FCM device token or OneSignal player ID
 * @param {object} notification - { title, body, icon?, image?, url?, data? }
 */
export async function sendPush(token, notification) {
    if (PUSH_PROVIDER === 'none') {
        console.log(`🔔 [PUSH-SIM] To: ${token.slice(0, 20)}... | Title: ${notification.title}`);
        return { success: true, messageId: `push_sim_${Date.now()}`, simulated: true };
    }

    if (PUSH_PROVIDER === 'fcm') return sendViaFCM(token, notification);
    if (PUSH_PROVIDER === 'onesignal') return sendViaOneSignal(token, notification);

    return { success: false, error: `Unknown push provider: ${PUSH_PROVIDER}` };
}

/**
 * Send push via Firebase Cloud Messaging
 */
async function sendViaFCM(token, notification) {
    try {
        const admin = await getFirebaseAdmin();
        if (!admin) return { success: false, error: 'Firebase Admin not initialized' };

        const message = {
            token,
            notification: {
                title: notification.title,
                body: notification.body,
                ...(notification.image ? { imageUrl: notification.image } : {}),
            },
            webpush: {
                fcmOptions: {
                    link: notification.url || '',
                },
                notification: {
                    icon: notification.icon || '/favicon.ico',
                    badge: notification.badge || '/badge.png',
                    ...(notification.actions ? {
                        actions: notification.actions,
                    } : {}),
                },
            },
            data: notification.data || {},
        };

        const result = await admin.messaging().send(message);
        return { success: true, messageId: result };
    } catch (err) {
        console.error('[Push] FCM send error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Send push via OneSignal REST API
 */
async function sendViaOneSignal(playerId, notification) {
    try {
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${ONESIGNAL_API_KEY}`,
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                include_player_ids: [playerId],
                headings: { en: notification.title },
                contents: { en: notification.body },
                ...(notification.image ? { big_picture: notification.image } : {}),
                ...(notification.url ? { url: notification.url } : {}),
                data: notification.data || {},
            }),
        });

        const data = await response.json();
        if (data.id) {
            return { success: true, messageId: data.id };
        }
        return { success: false, error: data.errors?.[0] || 'OneSignal send failed' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Send push to multiple devices
 */
export async function sendBulkPush(tokens, notification) {
    const results = [];
    for (const token of tokens) {
        const result = await sendPush(token, notification);
        results.push({ token: token.slice(0, 20) + '...', ...result });
        // Rate limit
        await new Promise(r => setTimeout(r, 50));
    }

    return {
        total: results.length,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    };
}

/**
 * Send to a topic (FCM only) — e.g. 'price_drop_alerts', 'back_in_stock'
 */
export async function sendToTopic(topic, notification) {
    if (PUSH_PROVIDER === 'none') {
        console.log(`🔔 [PUSH-SIM] Topic: ${topic} | Title: ${notification.title}`);
        return { success: true, messageId: `push_topic_sim_${Date.now()}`, simulated: true };
    }

    if (PUSH_PROVIDER !== 'fcm') {
        return { success: false, error: 'Topic send only supported on FCM' };
    }

    try {
        const admin = await getFirebaseAdmin();
        if (!admin) return { success: false, error: 'Firebase Admin not initialized' };

        const message = {
            topic,
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: notification.data || {},
        };

        const result = await admin.messaging().send(message);
        return { success: true, messageId: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Subscribe a token to an FCM topic
 */
export async function subscribeToTopic(tokens, topic) {
    if (PUSH_PROVIDER === 'none') {
        return { success: true, simulated: true, topic, subscribed: tokens.length };
    }

    try {
        const admin = await getFirebaseAdmin();
        if (!admin) return { success: false, error: 'Firebase Admin not initialized' };

        const result = await admin.messaging().subscribeToTopic(Array.isArray(tokens) ? tokens : [tokens], topic);
        return { success: true, successCount: result.successCount, failureCount: result.failureCount };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Generate the client-side service worker code for web push
 */
export function getServiceWorkerCode() {
    return `
// firebase-messaging-sw.js — Auto-generated by Mantram Retention Studio
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "{{FIREBASE_API_KEY}}",
    projectId: "{{FIREBASE_PROJECT_ID}}",
    messagingSenderId: "{{FIREBASE_SENDER_ID}}",
    appId: "{{FIREBASE_APP_ID}}"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body, icon, image } = payload.notification || {};
    self.registration.showNotification(title || 'New Update', {
        body: body || '',
        icon: icon || '/favicon.ico',
        image: image || undefined,
        data: payload.data || {},
    });
});
`.trim();
}

/**
 * Get push provider info
 */
export function getPushProviderInfo() {
    return {
        provider: PUSH_PROVIDER,
        configured: PUSH_PROVIDER !== 'none',
        supportsTopic: PUSH_PROVIDER === 'fcm',
        supportsWebPush: true,
        supportsMobilePush: PUSH_PROVIDER === 'fcm',
    };
}
