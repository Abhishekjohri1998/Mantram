import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { protect, generateToken } from '../middleware/auth.js';
import config from '../config/env.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

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
        // BUG-18 FIX: Input validation
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Name must be at least 2 characters' });
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, error: 'Valid email is required' });
        }
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }
        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }
        const user = await User.create({ name, email, password, company });
        const token = generateToken(user._id);
        res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, plan: user.plan },
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
        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        user.lastActive = Date.now();
        await user.save();
        const token = generateToken(user._id);
        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, plan: user.plan, company: user.company },
        });
    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
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
                isGoogleUser: true, // Optional: add this field to your User model if helpful
                password: Math.random().toString(36).slice(-12), // Placeholder for Google users
            });
            console.log(`✨ New user signed up via Google: ${user.email}`);
        } else {
            console.log(`👋 [GOOGLE AUTH] User found: ${user.email}`);
        }

        // 4. Generate JWT
        // Ultra-robust ID check: handle mongoose doc, POJO, or Array
        let userId = user?._id || user?.id;

        if (!userId && Array.isArray(user) && user[0]) {
            userId = user[0]._id || user[0].id;
            user = user[0];
        }

        // If still no ID, try a fallback findOne
        if (!userId && profileData.email) {
            console.warn(`⚠️ [GOOGLE AUTH] ID missing, attempting fallback search for ${profileData.email}`);
            const fallbackUser = await User.findOne({ email: profileData.email });
            if (fallbackUser) {
                user = fallbackUser;
                userId = user._id || user.id;
            }
        }

        if (!userId) {
            console.error('❌ [GOOGLE AUTH] User identification failed:', {
                user_exists: !!user,
                email: profileData.email
            });
            throw new Error(`User identification failed after login (Email: ${profileData.email})`);
        }

        const stringId = userId.toString();
        console.log(`✅ [GOOGLE AUTH] Success! User ID: ${stringId} (${user.email})`);

        const token = generateToken(stringId);
        const userData = {
            id: stringId,
            name: user.name,
            email: user.email,
            role: user.role || 'user',
            plan: user.plan || 'starter',
            company: user.company || '',
        };

        // 5. Success! Send token to frontend and close popup
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
