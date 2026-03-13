import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import { protect, generateToken } from '../middleware/auth.js';
import config from '../config/env.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { sendVerificationEmail, sendQueueRegistrationEmails } from '../utils/email.js';

const router = Router();

// Spam Protection: Domain Blacklist for common "burner" providers
const BLACKLISTED_DOMAINS = [
    'mailinator.com', 'yopmail.com', 'temp-mail.org', 'guerrillamail.com',
    '10minutemail.com', 'discard.email', 'dispostable.com', 'pookmail.com',
    'sharklasers.com', 'guerrillamailblock.com', 'pokemail.net'
];

// Helper: check DB is connected before any DB operation
function requireDB(req, res) {
    if (mongoose.connection.readyState !== 1) {
        res.status(503).json({ success: false, error: 'Database is temporarily unavailable. Please try again in a few seconds.' });
        return false;
    }
    return true;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    if (!requireDB(req, res)) return;
    try {
        const { name, email, password, company } = req.body;

        // Input validation
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Valid email is required' });
        }

        // Spam/Fraud Check: Check domain blacklist
        const domain = email.split('@')[1].toLowerCase();
        if (BLACKLISTED_DOMAINS.includes(domain)) {
            return res.status(400).json({ success: false, error: 'Temporary/Disposable email addresses are not allowed for security reasons.' });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Calculate queue number (total users with role: 'user' + 1)
        const lastUser = await User.findOne({ role: 'user' }).sort('-queueNumber');
        const queueNumber = (lastUser?.queueNumber || 0) + 1;

        const user = await User.create({
            name,
            email,
            password,
            company,
            verificationToken,
            verificationExpires,
            isVerified: false,
            approvalStatus: 'pending',
            queueNumber
        });

        // Send dual notification emails (User & Admin)
        try {
            await sendQueueRegistrationEmails(user, queueNumber);
        } catch (emailErr) {
            console.error('⚠️ Queue registration emails failed to send:', emailErr.message);
        }

        // Send verification email separately (original flow maintained)
        try {
            await sendVerificationEmail(user, verificationToken);
        } catch (emailErr) {
            console.error('⚠️ Verification email failed to send, but user created:', emailErr.message);
            // We don't fail registration here, user can request a resend later
        }

        res.status(201).json({
            success: true,
            message: `Registration successful. You are at position #${queueNumber} in the queue. Please check your email for confirmation and to verify your account.`,
            queueNumber,
            verifyEmail: user.email
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    if (!requireDB(req, res)) return;
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Provide email and password' });
        }

        // Select verification fields to check status
        const user = await User.findOne({ email }).select('+password +verificationToken +verificationExpires');

        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // 1. Verification Check
        if (!user.isVerified) {
            return res.status(401).json({
                success: false,
                error: 'Please verify your email address to log in.',
                needsVerification: true,
                email: user.email
            });
        }

        // 2. Approval Check
        if (user.approvalStatus === 'pending') {
            return res.status(403).json({
                success: false,
                error: `Your account is pending approval. You are currently at position #${user.queueNumber || 'N/A'} in the waitlist. We'll notify you via email once approved.`,
                isPending: true,
                queueNumber: user.queueNumber
            });
        }

        if (user.approvalStatus === 'rejected') {
            return res.status(403).json({
                success: false,
                error: 'Your registration request was not approved. Please contact support if you believe this is an error.'
            });
        }

        user.lastActive = Date.now();
        await user.save();

        const token = generateToken(user._id);
        const planDetails = await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean();
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, plan: user.plan, company: user.company, planDetails },
        });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ success: false, error: 'Verification token is required' });

        const user = await User.findOne({
            verificationToken: token,
            verificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid or expired verification token. Please request a new one.' });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Email verified successfully! You can now log in.' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        const user = await User.findOne({ email });
        if (!user) {
            // Success response for security (prevents account discovery)
            return res.json({ success: true, message: 'If an account exists, a new verification link has been sent.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ success: false, error: 'Account is already verified' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        user.verificationToken = verificationToken;
        user.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await user.save();

        await sendVerificationEmail(user, verificationToken);

        res.json({ success: true, message: 'A new verification link has been sent to your email.' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const planDetails = await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean();
    res.json({ success: true, user: { ...user, planDetails } });
});

// PUT /api/auth/profile
router.put('/profile', protect, async (req, res) => {
    const { name, company, avatar, preferences } = req.body;
    const user = await User.findByIdAndUpdate(
        req.user._id,
        { name, company, avatar, preferences },
        { returnDocument: 'after', runValidators: true }
    );
    res.json({ success: true, user });
});

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE OAUTH (Login/Signup)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow
 */
router.get('/google', (req, res) => {
    const clientId = config.google.clientId;
    const redirectUri = config.google.callbackUrl || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;

    if (!clientId) {
        return res.status(500).json({ success: false, error: 'Google Client ID not configured' });
    }

    const scopes = [
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'openid',
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&prompt=select_account`;

    // Ensure popup can communicate back
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.json({ success: true, authUrl });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
    // Ensure popup can communicate back
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    try {
        const { code, error: authError } = req.query;

        if (authError) {
            return res.send(closeAuthPopupScript('Google authorization was cancelled.'));
        }
        if (!code) {
            return res.send(closeAuthPopupScript('Missing authorization code.'));
        }

        const clientId = config.google.clientId;
        const clientSecret = config.google.clientSecret;
        const redirectUri = config.google.callbackUrl || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`;

        // 1. Exchange code for tokens
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResp.json();

        if (tokenData.error) {
            console.error('Google Auth token exchange failed:', tokenData.error);
            return res.send(closeAuthPopupScript(`Auth failed: ${tokenData.error_description || tokenData.error}`));
        }

        const { access_token } = tokenData;

        // 2. Fetch user profile from Google
        const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` },
        });
        const profileData = await profileResp.json();

        if (!profileData.email) {
            return res.send(closeAuthPopupScript('Could not retrieve email from Google.'));
        }

        // 3. Find or Create User
        let user = await User.findOne({ email: profileData.email });

        if (!user) {
            // Signup flow
            user = await User.create({
                name: profileData.name || 'Google User',
                email: profileData.email,
                avatar: profileData.picture,
                isGoogleUser: true,
                isVerified: true, // Google users are pre-verified
                password: Math.random().toString(36).slice(-12),
            });
            console.log(`✨ New user signed up via Google: ${user.email}`);
        } else {
            console.log(`👋 [GOOGLE AUTH] User found: ${user.email}`);
            // If user existed but wasn't verified, mark as verified if they successfully OAuthed
            if (!user.isVerified) {
                user.isVerified = true;
                await user.save();
            }
        }

        // 4. Generate JWT
        let userId = user?._id || user?.id;

        if (!userId && Array.isArray(user) && user[0]) {
            userId = user[0]._id || user[0].id;
            user = user[0];
        }

        if (!userId && profileData.email) {
            const fallbackUser = await User.findOne({ email: profileData.email });
            if (fallbackUser) {
                user = fallbackUser;
                userId = user._id || user.id;
            }
        }

        if (!userId) {
            throw new Error(`User identification failed after login (Email: ${profileData.email})`);
        }

        const stringId = userId.toString();
        const token = generateToken(stringId);
        const userData = {
            id: stringId,
            name: user.name,
            email: user.email,
            role: user.role || 'user',
            plan: user.plan || 'starter',
            company: user.company || '',
            planDetails: await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean(),
        };

        res.send(closeAuthPopupScript(null, token, userData));

    } catch (error) {
        console.error('Google Auth callback error:', error);
        res.send(closeAuthPopupScript(`Internal Server Error: ${error.message}`));
    }
});

/**
 * Helper: Close popup and pass token/user to opener
 */
function closeAuthPopupScript(error, token = '', user = null) {
    return `<!DOCTYPE html>
<html><head><title>Authenticating...</title></head>
<body style="background:#0a0c16;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div style="text-align:center;">
${error
            ? `<p style="color:#f87171;">❌ ${error}</p><p style="color:#94a3b8;font-size:14px;">Please close this window and try again.</p>`
            : `<p style="color:#34d399;font-weight:bold;font-size:18px;">✅ Authenticated Successfully!</p><p style="color:#94a3b8;font-size:14px;">Setting up your dashboard...</p>`
        }
</div>
<script>
    if (window.opener) {
        window.opener.postMessage({
            type: 'GOOGLE_AUTH_SUCCESS',
            ${error ? `error: ${JSON.stringify(error)}` : `token: '${token}', user: ${JSON.stringify(user)}`}
        }, '*');
    }
    ${!error ? 'setTimeout(() => window.close(), 1000);' : ''}
</script>
</body></html>`;
}

export default router;
