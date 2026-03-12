import nodemailer from 'nodemailer';
import env from '../config/env.js';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: env.email.user,
        pass: env.email.pass
    }
});

/**
 * Send a professional email
 */
export const sendEmail = async ({ to, subject, html }) => {
    const mailOptions = {
        from: `"Mantram AI" <${env.email.user}>`,
        to,
        subject,
        html
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('❌ Email Send Error:', error);
        throw error;
    }
};

/**
 * Template for Verification Email
 */
export const sendVerificationEmail = async (user, token) => {
    const frontendBase = Array.isArray(env.frontendUrl) ? env.frontendUrl[env.frontendUrl.length - 1] : (env.frontendUrl || 'https://mantram.ai');
    const verifyLink = `${frontendBase}/verify-email?token=${token}`;

    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 40px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px; color: #fff; letter-spacing: -0.5px;">Welcome to Mantram AI 🚀</h1>
                <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">One last step to secure your marketing hub</p>
            </div>
            <div style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Hi ${user.name},</p>
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                    Thank you for joining Mantram AI! To protect your account and prevent spam, we need you to verify your email address.
                </p>
                <div style="text-align: center; margin: 40px 0;">
                    <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 15px rgba(99,102,241,0.3);">Verify My Email</a>
                </div>
                <p style="font-size: 13px; color: #64748b; text-align: center;">This link will expire in 24 hours.</p>
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 32px 0;" />
                <p style="font-size: 12px; color: #475569; text-align: center; line-height: 1.5;">
                    If the button above doesn't work, copy and paste this URL into your browser:<br/>
                    <a href="${verifyLink}" style="color: #818cf8; word-break: break-all;">${verifyLink}</a>
                </p>
            </div>
            <div style="padding: 20px 24px; background: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                <p style="margin: 0; font-size: 12px; color: #475569;">&copy; 2024 Mantram AI. All rights reserved.</p>
            </div>
        </div>
    `;

    return sendEmail({
        to: user.email,
        subject: 'Verify your Mantram AI account 🛡️',
        html
    });
};

/**
 * Send Queue Registration Emails (Dual Notification)
 */
export const sendQueueRegistrationEmails = async (user, queueNumber) => {
    const userHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
            <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 40px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px; color: #fff;">You're in the Queue! 🕒</h1>
                <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">Welcome to Mantram AI, ${user.name}</p>
            </div>
            <div style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Your registration was successful! Due to high demand, we've placed you in our early access queue.</p>
                <div style="background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 12px; padding: 24px; text-align: center; margin: 32px 0;">
                    <p style="margin: 0; font-size: 14px; color: #818cf8; text-transform: uppercase; font-weight: 600;">Your Position</p>
                    <p style="margin: 5px 0 0; font-size: 48px; font-weight: 800; color: #fff;">#${queueNumber}</p>
                </div>
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Our team is reviewing registrations manually. We'll send you another email the moment your account is approved.</p>
            </div>
            <div style="padding: 24px; background: rgba(255,255,255,0.02); text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #475569;">&copy; 2024 Mantram AI. Thank you for your patience.</p>
            </div>
        </div>
    `;

    const adminHtml = `
        <div style="font-family: system-ui; background: #f8fafc; padding: 40px;">
            <div style="max-width: 500px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); padding: 32px;">
                <h2 style="color: #1e293b; margin-top: 0;">New User Pending Approval</h2>
                <div style="margin: 24px 0; padding: 20px; border-radius: 6px; background: #f1f5f9;">
                    <p style="margin: 0 0 10px; font-size: 14px;"><strong>Name:</strong> ${user.name}</p>
                    <p style="margin: 0 0 10px; font-size: 14px;"><strong>Email:</strong> ${user.email}</p>
                    <p style="margin: 0 0 10px; font-size: 14px;"><strong>Company:</strong> ${user.company || 'N/A'}</p>
                    <p style="margin: 0; font-size: 14px;"><strong>Queue Position:</strong> #${queueNumber}</p>
                </div>
                <p style="color: #64748b; font-size: 14px;">Log in to the Superadmin dashboard to review and approve this user.</p>
            </div>
        </div>
    `;

    // 1. Send to User
    await sendEmail({
        to: user.email,
        subject: `You're in the queue! (Position #${queueNumber}) | Mantram AI 🕒`,
        html: userHtml
    });

    // 2. Send to Superadmin (using environment variable or fallback to env.email.user)
    const superadminEmail = process.env.SUPERADMIN_NOTIFY_EMAIL || env.email.user;
    await sendEmail({
        to: superadminEmail,
        subject: `🚨 [APPROVAL REQUIRED] New Registration: #${queueNumber} - ${user.name}`,
        html: adminHtml
    });

    return true;
};

/**
 * Send Approval Notification Email
 */
export const sendApprovalEmail = async (user) => {
    const frontendBase = Array.isArray(env.frontendUrl) ? env.frontendUrl[env.frontendUrl.length - 1] : (env.frontendUrl || 'https://mantram.ai');
    
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
            <div style="background: linear-gradient(135deg, #10b981, #34d399); padding: 40px 24px; text-align: center;">
                <h1 style="margin: 0; font-size: 28px; color: #fff;">You're Approved! ✨</h1>
                <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">Your Mantram AI account is ready</p>
            </div>
            <div style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Hi ${user.name},</p>
                <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">Great news! Your registration has been reviewed and approved by our team. You now have full access to our AI creative studios.</p>
                <div style="text-align: center; margin: 40px 0;">
                    <a href="${frontendBase}/login" style="display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #fff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-size: 16px; font-weight: 700;">Login & Get Started</a>
                </div>
            </div>
            <div style="padding: 24px; background: rgba(255,255,255,0.02); text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #475569;">&copy; 2024 Mantram AI. Let the creativity begin!</p>
            </div>
        </div>
    `;

    return sendEmail({
        to: user.email,
        subject: 'Welcome Aboard! Your account has been approved ✨',
        html
    });
};
