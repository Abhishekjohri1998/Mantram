/**
 * Pulse Mail — ESP Export Integrations
 * Supports: Klaviyo, Mailchimp, Brevo, Gmail draft, mailto
 */

export async function pushToKlaviyo(name, html, apiKey) {
    const key = apiKey || process.env.KLAVIYO_API_KEY;
    if (!key) return { success: false, error: 'Klaviyo key not configured' };
    const res = await fetch('https://a.klaviyo.com/api/templates/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            'Authorization': `Klaviyo-API-Key ${key}`,
            'revision': '2025-01-15',
        },
        body: JSON.stringify({
            data: { type: 'template', attributes: { name, html, editor_type: 'CODE' } },
        }),
    });
    if (!res.ok) {
        const e = await res.text();
        return { success: false, error: `Klaviyo (${res.status}): ${e}` };
    }
    const data = await res.json();
    const id = data?.data?.id;
    return {
        success: true, templateId: id, platform: 'klaviyo',
        templateUrl: `https://www.klaviyo.com/email-editor/${id}`,
    };
}

export async function pushToMailchimp(name, html, apiKey, serverPrefix) {
    const key = apiKey || process.env.MAILCHIMP_API_KEY;
    const server = serverPrefix || process.env.MAILCHIMP_SERVER_PREFIX || 'us1';
    if (!key) return { success: false, error: 'Mailchimp key not configured' };
    const creds = Buffer.from(`anystring:${key}`).toString('base64');
    const res = await fetch(`https://${server}.api.mailchimp.com/3.0/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${creds}` },
        body: JSON.stringify({ name, html }),
    });
    if (!res.ok) {
        const e = await res.text();
        return { success: false, error: `Mailchimp (${res.status}): ${e}` };
    }
    const data = await res.json();
    return { success: true, templateId: data.id, platform: 'mailchimp' };
}

export async function pushToBrevo(name, html, apiKey) {
    const key = apiKey || process.env.BREVO_API_KEY;
    if (!key) return { success: false, error: 'Brevo key not configured' };
    const res = await fetch('https://api.brevo.com/v3/smtp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': key },
        body: JSON.stringify({
            templateName: name, htmlContent: html, subject: name,
            sender: { name: 'Mantram', email: 'noreply@mantram.ai' },
            isActive: true,
        }),
    });
    if (!res.ok) {
        const e = await res.text();
        return { success: false, error: `Brevo (${res.status}): ${e}` };
    }
    const data = await res.json();
    return { success: true, templateId: data.id, platform: 'brevo' };
}

export function generateGmailLink(subject, bodyText, to = '') {
    const p = new URLSearchParams({ to, su: subject, body: bodyText.substring(0, 2000) });
    return `https://mail.google.com/mail/?view=cm&fs=1&${p.toString()}`;
}

export function generateMailtoLink(subject, bodyText, to = '') {
    return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText.substring(0, 1000))}`;
}

export async function exportEmailToPlatform({ platform, templateName, htmlContent, plainText, subject, apiKey, serverPrefix }) {
    switch (platform) {
        case 'klaviyo':   return pushToKlaviyo(templateName, htmlContent, apiKey);
        case 'mailchimp': return pushToMailchimp(templateName, htmlContent, apiKey, serverPrefix);
        case 'brevo':     return pushToBrevo(templateName, htmlContent, apiKey);
        case 'gmail':     return { success: true, platform: 'gmail', url: generateGmailLink(subject, plainText) };
        case 'mailto':    return { success: true, platform: 'mailto', url: generateMailtoLink(subject, plainText) };
        default:          return { success: true, platform: 'download', html: htmlContent };
    }
}
