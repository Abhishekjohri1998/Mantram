/**
 * Alert & Notification Engine
 * 
 * Sends performance alerts via WhatsApp, Slack, and Email.
 * Triggered by anomaly detection, optimization cycles, or scheduled digests.
 * 
 * Channels:
 * - WhatsApp (via WhatsApp Business API / Twilio)
 * - Slack (via Incoming Webhooks)
 * - Email (via existing email service)
 */

import Integration from '../../models/Integration.js';
import config from '../../config/env.js';

// ══════════════════════════════════════════════════════════════════════════════
// ALERT CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const ALERT_TYPES = {
    'anomaly': { emoji: '🚨', prefix: 'ALERT', priority: 'high' },
    'optimization': { emoji: '🤖', prefix: 'OPTIMIZER', priority: 'medium' },
    'daily-digest': { emoji: '📊', prefix: 'DAILY', priority: 'low' },
    'budget-warning': { emoji: '💰', prefix: 'BUDGET', priority: 'high' },
    'roas-milestone': { emoji: '🎯', prefix: 'MILESTONE', priority: 'medium' },
    'campaign-ended': { emoji: '⏹️', prefix: 'CAMPAIGN', priority: 'low' },
};


// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED ALERT DISPATCHER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send an alert across all configured channels.
 * userPrefs controls which channels are active.
 */
export async function sendAlert(userId, brandId, alertType, alertData) {
    const typeConfig = ALERT_TYPES[alertType] || ALERT_TYPES['anomaly'];
    const message = formatAlertMessage(typeConfig, alertData);

    // Get user's notification preferences
    const prefs = await getNotificationPrefs(userId);

    const results = {
        whatsapp: null,
        slack: null,
        email: null,
    };

    // Send to all enabled channels in parallel
    const promises = [];

    if (prefs.whatsapp?.enabled) {
        promises.push(
            sendWhatsApp(prefs.whatsapp.phone, message.whatsapp)
                .then(r => { results.whatsapp = { sent: true, ...r }; })
                .catch(e => { results.whatsapp = { sent: false, error: e.message }; })
        );
    }

    if (prefs.slack?.enabled) {
        promises.push(
            sendSlack(prefs.slack.webhookUrl, message.slack, typeConfig)
                .then(r => { results.slack = { sent: true }; })
                .catch(e => { results.slack = { sent: false, error: e.message }; })
        );
    }

    if (prefs.email?.enabled) {
        promises.push(
            sendEmail(prefs.email.address, message.email, typeConfig)
                .then(r => { results.email = { sent: true }; })
                .catch(e => { results.email = { sent: false, error: e.message }; })
        );
    }

    await Promise.allSettled(promises);

    return {
        alertType,
        message: message.plain,
        channels: results,
        sentAt: new Date(),
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// WHATSAPP — via WhatsApp Business API / Twilio
// ══════════════════════════════════════════════════════════════════════════════

async function sendWhatsApp(phone, message) {
    // Option 1: Twilio WhatsApp API
    const twilioSid = config.twilio?.accountSid || process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = config.twilio?.authToken || process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = config.twilio?.whatsappFrom || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

    if (!twilioSid || !twilioToken) {
        // Fallback: log warning
        console.warn('WhatsApp alert skipped — Twilio credentials not configured');
        return { provider: 'twilio', skipped: true, reason: 'credentials not configured' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const body = new URLSearchParams({
        To: `whatsapp:${phone}`,
        From: twilioFrom,
        Body: message,
    });

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    const data = await resp.json();
    return { provider: 'twilio', sid: data.sid, status: data.status };
}


// ══════════════════════════════════════════════════════════════════════════════
// SLACK — via Incoming Webhooks
// ══════════════════════════════════════════════════════════════════════════════

async function sendSlack(webhookUrl, message, typeConfig) {
    if (!webhookUrl) {
        console.warn('Slack alert skipped — webhook URL not configured');
        return { skipped: true, reason: 'webhook not configured' };
    }

    const severityColor = {
        high: '#FF4444',
        medium: '#FFAA00',
        low: '#44BB44',
    };

    const payload = {
        blocks: [
            {
                type: 'header',
                text: { type: 'plain_text', text: `${typeConfig.emoji} Mantram AI — ${typeConfig.prefix}`, emoji: true },
            },
            {
                type: 'section',
                text: { type: 'mrkdwn', text: message },
            },
            {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Priority: *${typeConfig.priority}* | Sent: ${new Date().toLocaleString('en-IN')}` }],
            },
        ],
        attachments: [{
            color: severityColor[typeConfig.priority] || '#666666',
            fallback: message,
        }],
    };

    await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    return { sent: true };
}


// ══════════════════════════════════════════════════════════════════════════════
// EMAIL — via existing email infrastructure
// ══════════════════════════════════════════════════════════════════════════════

async function sendEmail(toAddress, htmlContent, typeConfig) {
    // Use Resend, SendGrid, or Nodemailer based on config
    const resendApiKey = config.resend?.apiKey || process.env.RESEND_API_KEY;

    if (!resendApiKey) {
        console.warn('Email alert skipped — email service not configured');
        return { skipped: true, reason: 'email service not configured' };
    }

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'Mantram AI <alerts@mantram.ai>',
            to: [toAddress],
            subject: `${typeConfig.emoji} [${typeConfig.prefix}] Performance Marketing Alert`,
            html: htmlContent,
        }),
    });

    const data = await resp.json();
    return { provider: 'resend', id: data.id };
}


// ══════════════════════════════════════════════════════════════════════════════
// MESSAGE FORMATTING
// ══════════════════════════════════════════════════════════════════════════════

function formatAlertMessage(typeConfig, alertData) {
    const { title, summary, metrics, actions, campaigns } = alertData;

    // Plain text (for WhatsApp)
    const whatsapp = [
        `${typeConfig.emoji} *${typeConfig.prefix}: ${title}*`,
        '',
        summary,
        '',
        metrics ? Object.entries(metrics).map(([k, v]) => `📈 ${k}: ${v}`).join('\n') : '',
        '',
        actions?.length ? `*Actions:*\n${actions.map(a => `→ ${a}`).join('\n')}` : '',
        '',
        `_Mantram AI — ${new Date().toLocaleString('en-IN')}_`,
    ].filter(Boolean).join('\n');

    // Slack markdown
    const slack = [
        `*${title}*`,
        summary,
        metrics ? Object.entries(metrics).map(([k, v]) => `> 📈 *${k}:* ${v}`).join('\n') : '',
        actions?.length ? `*Recommended Actions:*\n${actions.map(a => `• ${a}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    // HTML (for email)
    const email = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">${typeConfig.emoji} ${typeConfig.prefix}: ${title}</h1>
    </div>
    <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 12px 12px;">
        <p style="color: #333; font-size: 15px; line-height: 1.6;">${summary}</p>
        ${metrics ? `
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            ${Object.entries(metrics).map(([k, v]) => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">${k}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${v}</td>
            </tr>`).join('')}
        </table>` : ''}
        ${actions?.length ? `
        <h3 style="color: #333; margin-top: 20px;">Recommended Actions</h3>
        <ul style="color: #555;">${actions.map(a => `<li>${a}</li>`).join('')}</ul>` : ''}
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
            Mantram AI Performance Marketing Studio<br>
            ${new Date().toLocaleString('en-IN')}
        </p>
    </div>
</div>`;

    return { whatsapp, slack, email, plain: `${typeConfig.prefix}: ${title} — ${summary}` };
}


// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get user's notification preferences from Integration model.
 */
async function getNotificationPrefs(userId) {
    const slackIntegration = await Integration.findOne({
        user: userId,
        platform: 'slack',
        status: 'connected',
    }).lean();

    const whatsappIntegration = await Integration.findOne({
        user: userId,
        platform: 'whatsapp',
        status: 'connected',
    }).lean();

    return {
        slack: {
            enabled: !!slackIntegration,
            webhookUrl: slackIntegration?.platformData?.webhookUrl || process.env.SLACK_WEBHOOK_URL,
        },
        whatsapp: {
            enabled: !!whatsappIntegration,
            phone: whatsappIntegration?.platformData?.phone || '',
        },
        email: {
            enabled: true, // Always enabled if email service is configured
            address: '', // TODO: pull from user profile
        },
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// PRE-BUILT ALERT TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Send an anomaly detection alert.
 */
export async function sendAnomalyAlert(userId, brandId, anomalies, actions) {
    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const highCount = anomalies.filter(a => a.severity === 'high').length;

    return sendAlert(userId, brandId, 'anomaly', {
        title: `${anomalies.length} Anomalies Detected`,
        summary: `Found ${criticalCount} critical and ${highCount} high-severity issues across your campaigns.`,
        metrics: {
            'Total Anomalies': anomalies.length,
            'Critical': criticalCount,
            'High': highCount,
            'Affected Campaigns': [...new Set(anomalies.map(a => a.campaignTitle))].length,
        },
        actions: actions?.map(a => `${a.action}: ${a.reason}`) || [],
    });
}

/**
 * Send optimization cycle completion alert.
 */
export async function sendOptimizationAlert(userId, brandId, report) {
    return sendAlert(userId, brandId, 'optimization', {
        title: 'Optimization Cycle Complete',
        summary: report.executiveSummary || 'Auto-optimizer has completed a full cycle.',
        metrics: report.keyMetrics || {},
        actions: report.actionsTaken || [],
    });
}

/**
 * Send daily performance digest.
 */
export async function sendDailyDigest(userId, brandId, dashboardData) {
    return sendAlert(userId, brandId, 'daily-digest', {
        title: 'Daily Performance Summary',
        summary: `Your campaigns spent ₹${dashboardData.totalSpend?.toLocaleString() || 0} today with ${dashboardData.totalConversions || 0} conversions.`,
        metrics: {
            'Total Spend': `₹${dashboardData.totalSpend?.toLocaleString() || 0}`,
            'Conversions': dashboardData.totalConversions || 0,
            'Blended ROAS': `${dashboardData.blendedRoas || 0}x`,
            'Active Campaigns': dashboardData.activeCampaigns || 0,
        },
    });
}
