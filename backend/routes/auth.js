import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { protect, generateToken } from '../middleware/auth.js';

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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        { new: true, runValidators: true }
    );
    res.json({ success: true, user });
});

// POST /api/auth/bootstrap-admin — One-time superadmin promotion (dev mode)
router.post('/bootstrap-admin', protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { role: 'superadmin', plan: 'enterprise' });
        const updated = await User.findById(req.user._id);
        res.json({ success: true, user: { id: updated._id, name: updated.name, email: updated.email, role: updated.role, plan: updated.plan } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
