import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Integration from '../models/Integration.js';
import Brand from '../models/Brand.js';
import config from '../config/env.js';
import { performMonthlyReset } from '../utils/credits.js';

// ── PERF-001: Per-process user cache (LRU with TTL) ──
// Eliminates User.findById() on every API call — saves 15-40ms per request.
const userCache = new Map();
const USER_CACHE_TTL = 60_000; // 60 seconds
const USER_CACHE_MAX = 500;

function getCachedUser(userId) {
    const entry = userCache.get(userId);
    if (entry && Date.now() - entry.ts < USER_CACHE_TTL) return entry.user;
    if (entry) userCache.delete(userId); // expired
    return null;
}

function setCachedUser(user) {
    // Simple LRU eviction — drop oldest if over max
    if (userCache.size >= USER_CACHE_MAX) {
        const oldest = userCache.keys().next().value;
        userCache.delete(oldest);
    }
    userCache.set(user._id.toString(), { user, ts: Date.now() });
}

/** Invalidate the user cache entry (call after credit deduction, profile update, etc.) */
export function invalidateUserCache(userId) {
    if (userId) userCache.delete(userId.toString());
}

// Protect routes — verify JWT (supports Shopify Session Tokens as fallback)
export const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // SSE fallback: EventSource can't set headers, so accept ?token= query param
    if (!token && req.query.token) {
        token = req.query.token;
    }
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    // 1. Try standard JWT verification
    try {
        const decoded = jwt.verify(token, config.jwtSecret);

        // PERF-001: Check in-memory cache before hitting DB
        const cached = getCachedUser(decoded.id);
        if (cached) {
            req.user = cached;
            return next();
        }

        const user = await User.findById(decoded.id).populate('activeSubscription');

        if (user) {
            // SEC-002 (FIX-03): Verify token version matches DB
            // Tokens issued before a password change have stale version and must be rejected.
            // Tokens without 'v' claim (legacy) are accepted during migration window.
            if (decoded.v !== undefined && user.tokenVersion !== undefined && decoded.v !== user.tokenVersion) {
                return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
            }

            // REL-020: Inline subscription expiry check
            if (user.activeSubscription && user.activeSubscription.endDate && new Date(user.activeSubscription.endDate) < new Date()) {
                console.log(`[Auth] Inline expiring subscription ${user.activeSubscription._id} for user ${user._id}`);
                const Subscription = mongoose.model('Subscription');
                await Subscription.findByIdAndUpdate(user.activeSubscription._id, { status: 'expired' });
                user.plan = 'free';
                user.activeSubscription = null;
                await user.save();
            }

            // Lazy credit sync/reset
            req.user = await performMonthlyReset(user);
            setCachedUser(req.user);
            return next();
        }
    } catch (jwtErr) {
        // Continue to Shopify verification
    }

    // 2. Try Shopify Session Token verification (as fallback)
    try {
        const secret = config.shopify.apiSecret;
        if (!secret) throw new Error('Shopify secret not configured');

        const decoded = jwt.verify(token, secret, {
            audience: config.shopify.apiKey,
            algorithms: ['HS256']
        });

        const shopDomain = decoded.dest.replace(/^https?:\/\//, '');
        
        // Look for ANY existing integration (connected or pending) for this shop
        let integration = await Integration.findOne({
            'platformData.shopDomain': shopDomain,
            platform: 'shopify',
            status: { $in: ['connected', 'pending'] }
        });

        if (integration) {
            const user = await User.findById(integration.user);
            if (user) {
                req.user = await performMonthlyReset(user);
                req.activeBrand = integration.brand;
                req.shopifyShop = shopDomain;
                req.shopifyAuth = true;
                return next();
            }
        }
        
        // ── AUTO-PROVISION: First-time Shopify install ──
        // Valid Shopify token but no integration/user found — create everything automatically.
        // This is critical for Shopify App Review: the reviewer installs the app and expects
        // it to work immediately without manual registration/approval.
        console.log(`🛍️ [AUTH] Auto-provisioning user for new Shopify install: ${shopDomain}`);
        
        const shopName = shopDomain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const userId = await User.generateUserId();
        
        const newUser = await User.create({
            name: shopName,
            email: `${shopDomain.replace(/\./g, '-')}@shopify-install.mantram.ai`,
            password: crypto.randomBytes(24).toString('hex'),
            userId,
            isVerified: true,
            approvalStatus: 'approved',
            company: shopName,
        });

        // Create a default brand for the shop
        const brand = await Brand.create({
            user: newUser._id,
            name: shopName,
            website: `https://${shopDomain}`,
            onboardingMethod: 'shopify',
            status: 'active',
            dna: { brandDescription: `Brand auto-created from Shopify install (${shopDomain})` },
        });

        // Create the pending integration (will become 'connected' after OAuth callback)
        integration = await Integration.create({
            user: newUser._id,
            brand: brand._id,
            platform: 'shopify',
            status: 'pending',
            platformData: { shopDomain, shopName },
            displayName: shopName,
            profileUrl: `https://${shopDomain}`,
        });

        console.log(`✅ [AUTH] Auto-provisioned: User=${newUser.email}, Brand=${brand.name}, Integration=${integration._id}`);

        req.user = newUser;
        req.activeBrand = brand._id;
        req.shopifyShop = shopDomain;
        req.shopifyAuth = true;
        return next();
    } catch (shopifyErr) {
        if (shopifyErr.message !== 'jwt malformed' && shopifyErr.message !== 'invalid signature') {
            console.error(`❌ [AUTH] Token verification failed (Standard & Shopify): ${shopifyErr.message}`);
        } else if (shopifyErr.message === 'invalid signature') {
            // Log as warning — common when sessions expire or JWT_SECRET changes
            console.warn(`⚠️ [AUTH] Invalid token signature recorded (User might need to re-login)`);
        }
        return res.status(401).json({ success: false, error: 'Token invalid or expired' });
    }
};

// Optional auth — attaches user if token present, continues without if not
export const optionalAuth = async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    // SSE fallback: EventSource can't set headers, so accept ?token= query param
    if (!token && req.query.token) {
        token = req.query.token;
    }
    if (token) {
        try {
            const decoded = jwt.verify(token, config.jwtSecret);
            const user = await User.findById(decoded.id);
            if (user) {
                req.user = await performMonthlyReset(user);
            }
        } catch { /* ignore invalid tokens */ }
    }
    next();
};

// Role-based access — superadmin always passes
export const authorize = (...roles) => (req, res, next) => {
    if (req.user.role === 'superadmin') return next();
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, error: `Role '${req.user.role}' not authorized` });
    }
    next();
};

export const superadmin = authorize('superadmin');

// Generate JWT — SEC-002 (FIX-02): Includes tokenVersion, set to 30d expiry
export const generateToken = (userId, tokenVersion = 0) => {
    return jwt.sign(
        { id: userId, v: tokenVersion },
        config.jwtSecret,
        { expiresIn: '30d' }
    );
};
