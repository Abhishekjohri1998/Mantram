import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/env.js';

// Protect routes — verify JWT
export const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
        return res.status(401).json({ success: false, error: 'Not authorized' });
    }
    try {
        const decoded = jwt.verify(token, config.jwtSecret);
        req.user = await User.findById(decoded.id);
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token invalid' });
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
            req.user = await User.findById(decoded.id);
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
