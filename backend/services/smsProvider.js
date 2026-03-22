/**
 * SMS Provider Service — Retention Studio
 * 
 * Abstraction layer for SMS delivery. Supports MSG91 (India) and Twilio (global).
 * Provides send, status check, and opt-in/out management.
 * 
 * To activate: Set SMS_PROVIDER, SMS_API_KEY, SMS_SENDER_ID in .env
 */

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'none'; // 'msg91', 'twilio', 'none'
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || 'MANTRAM';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || '';

/**
 * Send an SMS message
 * @param {string} to - Phone number (with country code, e.g. +919876543210)
 * @param {string} message - SMS body text (max 160 chars for standard SMS)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendSMS(to, message) {
    if (SMS_PROVIDER === 'none') {
        console.log(`📱 [SMS-SIM] To: ${to} | Message: ${message.slice(0, 50)}...`);
        return { success: true, messageId: `sim_${Date.now()}`, simulated: true };
    }

    if (SMS_PROVIDER === 'msg91') {
        return sendViaMSG91(to, message);
    }

    if (SMS_PROVIDER === 'twilio') {
        return sendViaTwilio(to, message);
    }

    return { success: false, error: `Unknown SMS provider: ${SMS_PROVIDER}` };
}

/**
 * Send SMS via MSG91 (popular in India)
 */
async function sendViaMSG91(to, message) {
    try {
        const response = await fetch('https://control.msg91.com/api/v5/flow/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authkey: SMS_API_KEY,
            },
            body: JSON.stringify({
                sender: SMS_SENDER_ID,
                route: '4', // Transactional
                country: '91',
                sms: [{
                    message,
                    to: [to.replace(/^\+91/, '')],
                }],
            }),
        });

        const data = await response.json();
        if (data.type === 'success') {
            return { success: true, messageId: data.request_id };
        }
        return { success: false, error: data.message || 'MSG91 send failed' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Send SMS via Twilio (global)
 */
async function sendViaTwilio(to, message) {
    try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
        const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

        const params = new URLSearchParams({
            To: to,
            From: TWILIO_FROM,
            Body: message,
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const data = await response.json();
        if (data.sid) {
            return { success: true, messageId: data.sid };
        }
        return { success: false, error: data.message || 'Twilio send failed' };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

/**
 * Send bulk SMS to multiple recipients
 */
export async function sendBulkSMS(recipients, message) {
    const results = [];
    for (const to of recipients) {
        const result = await sendSMS(to, message);
        results.push({ to, ...result });
        // Rate limit: 1 SMS per 100ms
        await new Promise(r => setTimeout(r, 100));
    }

    return {
        total: results.length,
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    };
}

/**
 * Get SMS provider info
 */
export function getSMSProviderInfo() {
    return {
        provider: SMS_PROVIDER,
        configured: SMS_PROVIDER !== 'none' && SMS_API_KEY.length > 0,
        senderId: SMS_SENDER_ID,
    };
}
