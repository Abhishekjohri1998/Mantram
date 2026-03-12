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
