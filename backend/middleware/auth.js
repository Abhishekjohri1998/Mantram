import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Integration from '../models/Integration.js';
import config from '../config/env.js';
import { performMonthlyReset } from '../utils/credits.js';

// Protect routes — verify JWT (supports Shopify Session Tokens as fallback)
export const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    // 1. Try standard JWT verification
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        const user = await User.findById(decoded.id);

        if (user) {
            // Lazy credit sync/reset
            req.user = await performMonthlyReset(user);
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
        const integration = await Integration.findOne({
            'platformData.shopDomain': shopDomain,
            platform: 'shopify',
            status: 'connected'
        });

        if (integration) {
            const user = await User.findById(integration.user);
            req.user = await performMonthlyReset(user);
            req.activeBrand = integration.brand;
            req.shopifyShop = shopDomain;
            req.shopifyAuth = true;
            return next();
        } else {
            // Valid Shopify token but no integration/user found — cannot proceed
            console.warn(`⚠️ [AUTH] Valid Shopify token for ${shopDomain} but no integration found`);
            return res.status(401).json({ success: false, error: 'Shopify store not connected. Please install the app first.' });
        }
    } catch (shopifyErr) {
        if (shopifyErr.message !== 'jwt malformed') {
            console.error(`❌ [AUTH] Token verification failed (Standard & Shopify): ${shopifyErr.message}`);
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

// Generate JWT
export const generateToken = (userId) => {
    return jwt.sign({ id: userId }, config.jwtSecret, { expiresIn: config.jwtExpire });
};
