/**
 * Retention Email Sender
 * 
 * Self-contained email sender for retention campaigns.
 * Uses Nodemailer with configurable SMTP, or falls back to Resend HTTP API.
 * Configured via RETENTION_SMTP_* or RESEND_API_KEY environment variables.
 * 
 * Priority:
 *  1. RETENTION_SMTP_* (custom SMTP — any provider)
 *  2. RESEND_API_KEY (Resend HTTP API — free, no SMTP needed)
 *  3. EMAIL_USER + EMAIL_PASS (legacy Gmail — existing config)
 */

import nodemailer from 'nodemailer';

let _transporter = null;
let _method = 'none';

function getTransporter() {
    if (_transporter) return { transporter: _transporter, method: _method };

    // Option 1: Dedicated SMTP config for retention
    if (process.env.RETENTION_SMTP_HOST && process.env.RETENTION_SMTP_USER) {
        _transporter = nodemailer.createTransport({
            host: process.env.RETENTION_SMTP_HOST,
            port: parseInt(process.env.RETENTION_SMTP_PORT || '587'),
            secure: process.env.RETENTION_SMTP_SECURE === 'true',
            auth: {
                user: process.env.RETENTION_SMTP_USER,
                pass: process.env.RETENTION_SMTP_PASS,
            },
        });
        _method = 'smtp';
        console.log(`📧 Retention Email: Using SMTP (${process.env.RETENTION_SMTP_HOST})`);
        return { transporter: _transporter, method: _method };
    }

    // Option 2: Resend SMTP (just need API key)
    if (process.env.RESEND_API_KEY) {
        _transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
                user: 'resend',
                pass: process.env.RESEND_API_KEY,
            },
        });
        _method = 'resend';
        console.log('📧 Retention Email: Using Resend SMTP');
        return { transporter: _transporter, method: _method };
    }

    // Option 3: Legacy Gmail (EMAIL_USER + EMAIL_PASS)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        _method = 'gmail';
        console.log('📧 Retention Email: Using Gmail SMTP');
        return { transporter: _transporter, method: _method };
    }

    console.warn('⚠️ Retention Email: No email credentials configured. Set RESEND_API_KEY or RETENTION_SMTP_* in .env');
    return { transporter: null, method: 'none' };
}

/**
 * Send a retention campaign email
 * @param {Object} opts - { to, subject, html, from? }
 */
export async function sendRetentionEmail({ to, subject, html, from }) {
    const { transporter, method } = getTransporter();

    if (!transporter) {
        throw new Error(
            'No email provider configured. Add one of these to your .env:\n' +
            '  RESEND_API_KEY=re_xxxx          (free: resend.com)\n' +
            '  RETENTION_SMTP_HOST=smtp.xxx     (any SMTP)\n' +
            '  EMAIL_USER + EMAIL_PASS          (Gmail app password)'
        );
    }

    const fromAddress = from || process.env.RETENTION_FROM_EMAIL || process.env.EMAIL_USER || 'noreply@mantram.ai';
    const fromName = process.env.RETENTION_FROM_NAME || 'Mantram AI';

    const result = await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html,
    });

    return { messageId: result.messageId, method };
}

/**
 * Check if email sending is configured
 */
export function isEmailConfigured() {
    const { method } = getTransporter();
    return method !== 'none';
}
