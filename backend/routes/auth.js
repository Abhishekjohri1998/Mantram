import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import Subscription from '../models/Subscription.js';
import { protect, generateToken } from '../middleware/auth.js';
import config from '../config/env.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { sendVerificationEmail, sendQueueRegistrationEmails } from '../utils/email.js';
import { normalizeEmail } from '../utils/normalizeEmail.js';

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

// Helper: create and assign default "Free" subscription
async function assignDefaultSubscription(user) {
    try {
        const freePackage = await SubscriptionPackage.findOne({ slug: 'free' });
        if (!freePackage) {
            console.warn('⚠️ Free subscription package not found in DB. Skipping auto-assignment.');
            return;
        }

        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);

        const subscription = await Subscription.create({
            user: user._id,
            plan: 'free',
            billingCycle: 'monthly',
            credits: { total: freePackage.credits?.monthly || 100, used: 0 },
            price: 0,
            startDate: new Date(),
            endDate,
            renewalDate: endDate,
            status: 'active',
            autoRenew: true,
        });

        await User.findByIdAndUpdate(user._id, {
            plan: 'free',
            activeSubscription: subscription._id,
            'credits.total': freePackage.credits?.monthly || 100,
            'credits.resetDate': endDate,
        });
        
        console.log(`✨ Assigned Free subscription to user: ${user.email}`);
        return subscription;
    } catch (err) {
        console.error('❌ Failed to assign default subscription:', err.message);
    }
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    if (!requireDB(req, res)) return;
    try {
        // POST /api/auth/register
        const { name, email, password, company, initialWebsite } = req.body;

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

        // Normalize email to prevent duplicates via Gmail dots/plus tricks
        // e.g. a.b.c@gmail.com = abc@gmail.com, user+tag@gmail.com = user@gmail.com
        const normalizedEmail = normalizeEmail(email);

        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) {
            return res.status(400).json({ success: false, error: 'Email already registered' });
        }

        // Calculate queue number (total users with role: 'user' + 1)
        const lastUser = await User.findOne({ role: 'user' }).sort('-queueNumber');
        const queueNumber = (lastUser?.queueNumber || 0) + 1;

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
        
        // Generate creative user ID
        const userId = await User.generateUserId();

        const user = await User.create({
            name,
            email: normalizedEmail,
            password,
            company,
            userId,
            verificationToken,
            verificationExpires,
            isVerified: false,
            approvalStatus: 'approved',
            queueNumber,
            milestones: {
                addedBrand: !!(company || initialWebsite)
            }
        });
        
        // Auto-create initial brand if company or initialWebsite is provided
        if (company || initialWebsite) {
            try {
                // Detect if company input is a URL (e.g. example.com, www.test.in)
                const companyTrim = company ? company.trim() : '';
                const isUrl = companyTrim && /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(companyTrim);
                let websiteUrl = initialWebsite || '';
                let brandName = company || (initialWebsite ? initialWebsite.split('.')[0].replace(/^https?:\/\//, '').replace(/^www\./, '') : 'New Brand');

                if (isUrl && !websiteUrl) {
                    websiteUrl = companyTrim;
                    if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
                    // Extract clean name from URL if possible
                    try {
                        const urlObj = new URL(websiteUrl);
                        brandName = urlObj.hostname.replace(/^www\./, '').split('.')[0];
                        brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
                    } catch (e) {
                        brandName = company;
                    }
                }

                await Brand.create({
                    user: user._id,
                    name: brandName,
                    website: websiteUrl,
                    onboardingMethod: 'website',
                    status: 'active',
                    dna: {
                        brandDescription: `Brand automatically created for ${brandName} during registration. ${isUrl || initialWebsite ? '[Website detected]' : ''}`
                    }
                });
                console.log(`✨ Auto-created initial brand for: ${user.email} (${brandName}) ${websiteUrl ? '[with website]' : ''}`);
            } catch (brandErr) {
                console.error('⚠️ Failed to auto-create initial brand:', brandErr.message);
            }
        }

        // --- NEW: Assign Free Subscription ---
        await assignDefaultSubscription(user);


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
            message: `Registration successful. Please check your email for confirmation and to verify your account.`,
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

        // Normalize email for lookup (handles Gmail dots, plus addressing)
        const normalizedEmail = normalizeEmail(email);

        // Select verification fields to check status
        const user = await User.findOne({ email: normalizedEmail }).select('+password +verificationToken +verificationExpires');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Account not found. It looks like you haven\'t signed up yet!',
                code: 'USER_NOT_FOUND' 
            });
        }

        if (!(await user.matchPassword(password))) {
            return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
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

        // NOTE: Approval gate removed — users can access after email verification only.
        // SuperAdmin can still manually reject users via the admin dashboard if needed.
        if (user.approvalStatus === 'rejected' && user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                error: 'Your account has been suspended. Please contact support if you believe this is an error.'
            });
        }

        user.lastActive = Date.now();
        await user.save();

        const token = generateToken(user._id);
        const planDetails = await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean();
        
        // Accurate brand count (Owned + Shared) - used for redirection logic
        const ownedCount = await Brand.countDocuments({ user: user._id, status: { $ne: 'archived' } });
        const sharedCount = await Brand.countDocuments({ sharedWith: user._id, status: { $ne: 'archived' } });
        const brandCount = ownedCount + sharedCount;
        
        res.json({
            success: true,
            token,
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                role: user.role, 
                plan: user.plan, 
                company: user.company, 
                teamRole: user.teamRole || '',
                organization: user.organization || null,
                isTeamMember: ownedCount === 0 && sharedCount > 0,
                planDetails,
                brandCount,
                completedWalkthroughs: user.completedWalkthroughs || []
            },
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

        const user = await User.findOne({ email: normalizeEmail(email) });
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

// ══════════════════════════════════════════════════════════════
// PASSWORD MANAGEMENT
// ══════════════════════════════════════════════════════════════

// POST /api/auth/forgot-password — Send password reset email
router.post('/forgot-password', async (req, res) => {
    if (!requireDB(req, res)) return;
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

        // Always return success to prevent account enumeration
        const successMsg = 'If an account with that email exists, a password reset link has been sent.';

        const user = await User.findOne({ email: normalizeEmail(email) });
        if (!user) {
            return res.json({ success: true, message: successMsg });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
        await user.save();

        // Build reset URL
        const frontendUrl = Array.isArray(config.frontendUrl) ? config.frontendUrl[0] : config.frontendUrl;
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send password reset email
        try {
            const { sendEmail } = await import('../utils/email.js');
            await sendEmail({
                to: user.email,
                subject: '🔐 Reset Your Mantram AI Password',
                html: `
                    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:40px 20px;">
                        <div style="text-align:center;margin-bottom:32px;">
                            <h1 style="color:#fff;font-size:24px;font-weight:800;margin:0;">Mantram AI</h1>
                            <p style="color:#94a3b8;font-size:14px;margin:8px 0 0;">Password Reset Request</p>
                        </div>
                        <div style="background:#1e1b4b;border-radius:16px;padding:32px;border:1px solid rgba(99,102,241,0.2);">
                            <p style="color:#e2e8f0;font-size:15px;line-height:1.6;margin:0 0 20px;">Hi <strong>${user.name}</strong>,</p>
                            <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
                                We received a request to reset your password. Click the button below to set a new password. 
                                This link expires in <strong>1 hour</strong>.
                            </p>
                            <div style="text-align:center;margin:24px 0;">
                                <a href="${resetUrl}" 
                                   style="display:inline-block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:14px;">
                                    Reset Password
                                </a>
                            </div>
                            <p style="color:#64748b;font-size:12px;line-height:1.6;margin:20px 0 0;">
                                If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
                            </p>
                        </div>
                        <p style="color:#475569;font-size:11px;text-align:center;margin:24px 0 0;">
                            © ${new Date().getFullYear()} Mantram AI • AI-Powered Marketing OS
                        </p>
                    </div>
                `,
            });
        } catch (emailErr) {
            console.error('⚠️ Password reset email failed:', emailErr.message);
        }

        res.json({ success: true, message: successMsg });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/auth/reset-password — Reset password with token
router.post('/reset-password', async (req, res) => {
    if (!requireDB(req, res)) return;
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ success: false, error: 'Token and new password are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() },
        }).select('+resetPasswordToken +resetPasswordExpires');

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid or expired reset token. Please request a new password reset.' });
        }

        user.password = password; // Will be hashed by pre-save hook
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Password has been reset successfully. You can now sign in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/auth/change-password — Change password (authenticated)
router.put('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, error: 'Current password and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user._id).select('+password');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        // Verify current password
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Current password is incorrect' });
        }

        user.password = newPassword; // Will be hashed by pre-save hook
        await user.save();

        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
    let user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Auto-generate userId for existing users who don't have one
    if (!user.userId) {
        const generatedId = await User.generateUserId();
        await User.findByIdAndUpdate(req.user._id, { userId: generatedId });
        user.userId = generatedId;
    }

    const planDetails = await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean();
    
    // Accurate brand count (Owned + Shared)
    const userId = user._id || user.id;
    const ownedCount = await Brand.countDocuments({ user: userId, status: { $ne: 'archived' } });
    const sharedCount = await Brand.countDocuments({ sharedWith: userId, status: { $ne: 'archived' } });
    const brandCount = ownedCount + sharedCount;

    res.json({ 
        success: true, 
        user: { 
            ...user, 
            completedWalkthroughs: user.completedWalkthroughs || [],
            planDetails, 
            brandCount,
            isTeamMember: ownedCount === 0 && sharedCount > 0 
        } 
    });

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

/**
 * PUT /api/auth/walkthrough
 * Marks a specific studio walkthrough as completed for the current user.
 */
router.put('/walkthrough', protect, async (req, res) => {
    try {
        const { studioId } = req.body;
        if (!studioId) return res.status(400).json({ success: false, error: 'studioId is required' });

        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $addToSet: { completedWalkthroughs: studioId } },
            { returnDocument: 'after', runValidators: true }
        );

        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        res.json({ 
            success: true, 
            completedWalkthroughs: user.completedWalkthroughs || [] 
        });
    } catch (error) {
        console.error('❌ Walkthrough update error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/auth/claim-userid — One-time custom User ID claim
router.put('/claim-userid', protect, async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: 'User ID is required' });

        // Validate format: 3-30 chars, lowercase alphanumeric + hyphens, no start/end hyphen
        const cleaned = userId.trim().toLowerCase();
        if (cleaned.length < 3 || cleaned.length > 30) {
            return res.status(400).json({ success: false, error: 'User ID must be 3-30 characters' });
        }
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(cleaned) && cleaned.length > 2) {
            return res.status(400).json({ success: false, error: 'Only lowercase letters, numbers, and hyphens. Cannot start/end with hyphen.' });
        }
        if (/--/.test(cleaned)) {
            return res.status(400).json({ success: false, error: 'Cannot have consecutive hyphens' });
        }

        // Check if user already claimed
        const currentUser = await User.findById(req.user._id);
        if (!currentUser) return res.status(404).json({ success: false, error: 'User not found' });
        if (currentUser.userIdClaimed) {
            return res.status(403).json({ success: false, error: 'You have already claimed your User ID. This is a one-time action.' });
        }

        // Check availability
        const existing = await User.findOne({ userId: cleaned, _id: { $ne: req.user._id } });
        if (existing) {
            return res.status(409).json({ success: false, error: 'This User ID is already taken. Try another one.' });
        }

        // Claim it
        currentUser.userId = cleaned;
        currentUser.userIdClaimed = true;
        await currentUser.save();

        res.json({ success: true, userId: cleaned, message: 'User ID claimed successfully! This is permanent.' });
    } catch (error) {
        console.error('Claim userId error:', error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, error: 'This User ID is already taken.' });
        }
        res.status(500).json({ success: false, error: 'Failed to claim User ID' });
    }
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

    const flow = req.query.flow || 'popup';
    const state = Buffer.from(JSON.stringify({ flow })).toString('base64');
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${state}` +
        `&prompt=select_account`;

    // Ensure popup can communicate back (for popup flow)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    if (flow === 'redirect') {
        return res.redirect(authUrl);
    }
    
    res.json({ success: true, authUrl });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */
router.get('/google/callback', async (req, res) => {
    // Ensure popup can communicate back
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    try {
        const { code, state, error: authError } = req.query;

        // Parse flow from state
        let flow = 'popup';
        try {
            if (state) {
                const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
                flow = decoded.flow || 'popup';
            }
        } catch (e) {
            console.warn('⚠️ Failed to parse OAuth state:', e.message);
        }

        if (authError) {
            if (flow === 'redirect') {
                const frontendUrl = config.frontendUrl[0] || 'https://mantram.ai';
                return res.redirect(`${frontendUrl}/auth?error=${encodeURIComponent('Google authorization was cancelled.')}`);
            }
            return res.send(closeAuthPopupScript('Google authorization was cancelled.'));
        }
        if (!code) {
            if (flow === 'redirect') {
                const frontendUrl = config.frontendUrl[0] || 'https://mantram.ai';
                return res.redirect(`${frontendUrl}/auth?error=${encodeURIComponent('Missing authorization code.')}`);
            }
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
            console.error('❌ Google Auth token exchange failed:', {
                error: tokenData.error,
                description: tokenData.error_description,
                sentClientId: clientId ? `${clientId.substring(0, 10)}...` : 'MISSING',
                sentRedirectUri: redirectUri
            });
            const errorMsg = `Auth failed: ${tokenData.error_description || tokenData.error}`;
            if (flow === 'redirect') {
                const frontendUrl = config.frontendUrl[0] || 'https://mantram.ai';
                return res.redirect(`${frontendUrl}/auth?error=${encodeURIComponent(errorMsg)}`);
            }
            return res.send(closeAuthPopupScript(`${errorMsg} (Check server logs for details)`));
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

        // 3. Find or Create User (normalize email to catch Gmail dot/plus duplicates)
        const normalizedGoogleEmail = normalizeEmail(profileData.email);
        let user = await User.findOne({ email: normalizedGoogleEmail });

        if (!user) {
            const userId = await User.generateUserId();
            user = await User.create({
                name: profileData.name || 'Google User',
                email: normalizedGoogleEmail,
                avatar: profileData.picture,
                userId,
                isGoogleUser: true,
                isVerified: true, // Google users are pre-verified
                password: Math.random().toString(36).slice(-12),
                approvalStatus: 'approved'
            });
            // --- NEW: Assign Free Subscription for Google Signup ---
            await assignDefaultSubscription(user);
            
            console.log(`✨ New user signed up via Google: ${user.email}`);
        } else {
            console.log(`👋 [GOOGLE AUTH] User found: ${user.email}`);
            // If user existed but wasn't verified, mark as verified if they successfully OAuthed
            if (!user.isVerified) {
                user.isVerified = true;
                await user.save();
            }
        }

        // NOTE: Approval gate removed — Google OAuth users get immediate access.
        // SuperAdmin can still reject users manually if needed.
        if (user.approvalStatus === 'rejected' && user.role !== 'superadmin') {
            const errorMsg = 'Your account has been suspended. Please contact support.';
            if (flow === 'redirect') {
                const frontendUrl = config.frontendUrl[0] || 'https://mantram.ai';
                return res.redirect(`${frontendUrl}/auth?error=${encodeURIComponent(errorMsg)}`);
            }
            return res.send(closeAuthPopupScript(errorMsg, '', null, true));
        }

        // 4. Generate JWT
        let userId = user?._id || user?.id;

        if (!userId && Array.isArray(user) && user[0]) {
            userId = user[0]._id || user[0].id;
            user = user[0];
        }

        if (!userId && profileData.email) {
            const fallbackUser = await User.findOne({ email: normalizedGoogleEmail });
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

        // Accurate brand count (Owned + Shared)
        const ownedCount = await Brand.countDocuments({ user: userId, status: { $ne: 'archived' } });
        const sharedCount = await Brand.countDocuments({ sharedWith: userId, status: { $ne: 'archived' } });
        const brandCount = ownedCount + sharedCount;

        const userData = {
            id: stringId,
            name: user.name,
            email: user.email,
            role: user.role || 'user',
            plan: user.plan || 'starter',
            company: user.company || '',
            teamRole: user.teamRole || '',
            organization: user.organization || null,
            isTeamMember: ownedCount === 0 && sharedCount > 0,
            planDetails: await SubscriptionPackage.findOne({ slug: user.plan || 'starter' }).lean(),
            brandCount,
            completedWalkthroughs: user.completedWalkthroughs || []
        };

        if (flow === 'redirect') {
            const frontendUrl = config.frontendUrl[0] || 'https://mantram.ai';
            const redirectParams = new URLSearchParams({
                token,
                user: JSON.stringify(userData)
            });
            return res.redirect(`${frontendUrl}/auth?${redirectParams.toString()}`);
        }

        res.send(closeAuthPopupScript(null, token, userData));


    } catch (error) {
        console.error('Google Auth callback error:', error);
        res.send(closeAuthPopupScript(`Internal Server Error: ${error.message}`));
    }
});

/**
 * Helper: Close popup and pass token/user to opener
 */
function closeAuthPopupScript(error, token = '', user = null, needsApproval = false) {
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
            ${error ? `error: ${JSON.stringify(error)}, needsApproval: ${needsApproval}` : `token: '${token}', user: ${JSON.stringify(user)}`}
        }, '*');
    }
    ${!error ? 'setTimeout(() => window.close(), 1000);' : ''}
</script>
</body></html>`;
}

// ══════════════════════════════════════════════════════════════
// STUDIO ACCESS — Public endpoint for frontend sidebar filtering
// ══════════════════════════════════════════════════════════════
import { resolveStudioAccess, STUDIO_KEYS, STUDIO_LABELS } from '../middleware/studioAccess.js';

/**
 * GET /api/auth/studio-access
 * Returns the resolved studio access map for the current user.
 * Called by the Sidebar on mount to filter navigation items.
 */
router.get('/studio-access', protect, async (req, res) => {
    try {
        const { access, portalVisibility } = await resolveStudioAccess(req.user);
        res.json({ success: true, access, portalVisibility, studioKeys: STUDIO_KEYS, studioLabels: STUDIO_LABELS });
    } catch (error) {
        // Fail open — return all studios accessible to avoid blocking users
        const allAccess = Object.fromEntries(STUDIO_KEYS.map(k => [k, true]));
        res.json({ success: true, access: allAccess });
    }
});

export default router;
