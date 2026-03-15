/**
 * Super Admin Routes V2 — Complete Platform Owner Management
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import Content from '../models/Content.js';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Product from '../models/Product.js';
import Integration from '../models/Integration.js';
import SeoAudit from '../models/SeoAudit.js';
import Subscription from '../models/Subscription.js';
import Coupon from '../models/Coupon.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import SystemSettings, { getSetting, setSetting } from '../models/SystemSettings.js';
import AuditLog from '../models/AuditLog.js';
import { CREDIT_COSTS, getCreditCosts, getCreditBalance, invalidateCreditCostCache } from '../middleware/credits.js';
import { protect, authorize, generateToken } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { logAudit } from '../utils/audit.js';
import CreditUsage from '../models/CreditUsage.js';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for Super Admin to prevent brute force / DoS on heavy stats
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 500, // Limit each IP to 500 requests per window
    message: { success: false, error: 'Too many administrative requests. Please try again later.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// All routes require superadmin
router.use(protect, authorize('superadmin'), adminLimiter);

// ══════════════════════════════════════════════════════════════
// 1. PLATFORM OVERVIEW
// ══════════════════════════════════════════════════════════════

router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalBrands, totalContent, totalCreatives, totalProducts, totalIntegrations, totalSubscriptions, totalCoupons, totalFeedback, totalSeoAudits] = await Promise.all([
            User.countDocuments(),
            Brand.countDocuments(),
            Content.countDocuments(),
            Creative.countDocuments(),
            Product.countDocuments(),
            Integration.countDocuments({ status: 'connected' }),
            Subscription.countDocuments({ status: 'active' }),
            Coupon.countDocuments({ isActive: true }),
            Feedback.countDocuments(),
            SeoAudit.countDocuments(),
        ]);

        const planDistribution = await User.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } },
        ]);

        const revenueData = await Subscription.aggregate([
            { $match: { status: 'active', price: { $gt: 0 } } },
            { $group: { _id: null, totalRevenue: { $sum: '$price' }, count: { $sum: 1 } } },
        ]);

        const recentUsersRaw = await User.find()
            .sort('-createdAt').limit(10)
            .select('name email plan role credits createdAt lastActive company approvalStatus');

        // Add credit balance virtualization for frontend
        const recentUsers = recentUsersRaw.map(u => ({
            ...u.toJSON(),
            creditBalance: getCreditBalance(u)
        }));

        const totalCreditsUsed = await User.aggregate([
            { $group: { _id: null, total: { $sum: '$credits.used' } } },
        ]);

        // Content by type
        const contentByType = await Content.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);

        // Feedback sentiment
        const feedbackSentiment = await Feedback.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: '$signalType', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]);

        // Users created per day (last 30 days)
        const userGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        // Usage Analytics: Top users, exhausted, and near exhaustion
        const [topUsersRaw, exhaustedUsersData] = await Promise.all([
            User.find()
                .sort('-credits.used')
                .limit(10)
                .select('name email plan credits.used credits.total credits.bonus lastActive'),
            User.aggregate([
                {
                    $project: {
                        isExhausted: {
                            $and: [
                                { $ne: ['$plan', 'enterprise'] },
                                { $ne: ['$role', 'superadmin'] },
                                {
                                    $lte: [
                                        { $subtract: [{ $add: ['$credits.total', '$credits.bonus'] }, '$credits.used'] },
                                        0
                                    ]
                                }
                            ]
                        },
                        isNearExhaustion: {
                            $and: [
                                { $ne: ['$plan', 'enterprise'] },
                                { $ne: ['$role', 'superadmin'] },
                                { $gt: [{ $subtract: [{ $add: ['$credits.total', '$credits.bonus'] }, '$credits.used'] }, 0] },
                                { $lte: [{ $subtract: [{ $add: ['$credits.total', '$credits.bonus'] }, '$credits.used'] }, { $multiply: [{ $add: ['$credits.total', '$credits.bonus'] }, 0.1] }] }
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        exhaustedCount: { $sum: { $cond: ['$isExhausted', 1, 0] } },
                        nearEmptyCount: { $sum: { $cond: ['$isNearExhaustion', 1, 0] } }
                    }
                }
            ])
        ]);

        const [topUsers, churnedUsersCount, returningUsersCount] = await Promise.all([
            Promise.resolve(topUsersRaw.map(u => ({ ...u.toJSON(), creditBalance: getCreditBalance(u) }))),
            User.countDocuments({ lastActive: { $lt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }, role: { $ne: 'superadmin' } }),
            User.countDocuments({ lastActive: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
        ]);

        const retentionRate = totalUsers > 0 ? (returningUsersCount / totalUsers * 100).toFixed(1) : 0;

        res.json({
            success: true,
            stats: {
                totalUsers, totalBrands, totalContent, totalCreatives, totalProducts,
                totalIntegrations, totalSubscriptions, totalCoupons, totalFeedback, totalSeoAudits,
                planDistribution,
                totalRevenue: revenueData[0]?.totalRevenue || 0,
                totalCreditsUsed: totalCreditsUsed[0]?.total || 0,
                recentUsers,
                contentByType,
                feedbackSentiment,
                userGrowth,
                usageAnalytics: {
                    topUsers,
                    exhaustedCount: exhaustedUsersData[0]?.exhaustedCount || 0,
                    nearEmptyCount: exhaustedUsersData[0]?.nearEmptyCount || 0,
                    churnedUsersCount,
                    retentionRate: `${retentionRate}%`
                },
                creditCosts: CREDIT_COSTS,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 2. USER MANAGEMENT
// ══════════════════════════════════════════════════════════════

router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search, plan, role, approvalStatus, sort = '-createdAt' } = req.query;
        const filter = {};
        if (search) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { name: new RegExp(safeSearch, 'i') },
                { email: new RegExp(safeSearch, 'i') },
                { company: new RegExp(safeSearch, 'i') },
            ];
        }
        if (plan) filter.plan = plan;
        if (role) filter.role = role;
        if (approvalStatus) filter.approvalStatus = approvalStatus;

        const users = await User.find(filter)
            .sort(sort)
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('-password')
            .populate('activeSubscription');

        const total = await User.countDocuments(filter);

        const usersWithCredits = users.map(u => ({
            ...u.toJSON(),
            creditBalance: getCreditBalance(u),
        }));

        res.json({ success: true, users: usersWithCredits, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Get single user with full details
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password').populate('activeSubscription');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const [brandCount, contentCount, creativeCount, integrationCount] = await Promise.all([
            Brand.countDocuments({ user: user._id }),
            Content.countDocuments({ user: user._id }),
            Creative.countDocuments({ user: user._id }),
            Integration.countDocuments({ user: user._id, status: 'connected' }),
        ]);

        res.json({
            success: true,
            user: { ...user.toJSON(), creditBalance: getCreditBalance(user) },
            stats: { brandCount, contentCount, creativeCount, integrationCount },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.put('/users/:id', async (req, res) => {
    try {
        const { plan, role, credits, company } = req.body;
        const update = {};
        if (plan) update.plan = plan;
        if (role && role !== 'superadmin') update.role = role;
        if (company !== undefined) update.company = company;
        if (credits) {
            if (credits.total !== undefined) update['credits.total'] = credits.total;
            if (credits.used !== undefined) update['credits.used'] = credits.used;
            if (credits.bonus !== undefined) update['credits.bonus'] = credits.bonus;
        }
        if (plan && !credits) {
            const pkg = await SubscriptionPackage.findOne({ slug: plan });
            if (pkg) {
                update['credits.total'] = pkg.credits?.monthly || 50;
                update['credits.used'] = 0;
            } else {
                // Fallback for legacy plans if package not found
                const legacyCredits = { starter: 50, professional: 500, enterprise: 999999 };
                update['credits.total'] = legacyCredits[plan] || 50;
                update['credits.used'] = 0;
            }
        }
        const previousUser = await User.findById(req.params.id).select('-password');
        if (!previousUser) return res.status(404).json({ success: false, error: 'User not found' });

        const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select('-password');
        
        await logAudit(req, {
            action: 'UPDATE_USER',
            targetModel: 'User',
            targetId: user._id,
            changes: { before: previousUser.toJSON(), after: user.toJSON() }
        });

        res.json({ success: true, user: { ...user.toJSON(), creditBalance: getCreditBalance(user) } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Cannot delete your own account' });
        }

        // Block deletion if user has an active plan
        const activeSub = await Subscription.findOne({ 
            user: user._id, 
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (activeSub) {
            const now = new Date();
            const end = new Date(activeSub.endDate);
            const diff = end - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            let remainingText = `${days} days and ${hours} hours`;
            if (days === 0) remainingText = `${hours} hours`;
            
            return res.status(400).json({ 
                success: false, 
                error: `Cannot delete user with active plan. Plan expires in ${remainingText} (${end.toLocaleDateString()}).` 
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await Promise.all([
                Brand.collection.deleteMany({ user: user._id }, { session }),
                Content.collection.deleteMany({ user: user._id }, { session }),
                Creative.collection.deleteMany({ user: user._id }, { session }),
                Integration.collection.deleteMany({ user: user._id }, { session }),
                Product.collection.deleteMany({ brand: { $in: await Brand.find({ user: user._id }).distinct('_id') } }, { session }),
                Subscription.collection.deleteMany({ user: user._id }, { session }),
                Feedback.collection.deleteMany({ user: user._id }, { session }),
                SeoAudit.collection.deleteMany({ user: user._id }, { session }),
                User.findByIdAndDelete(user._id, { session }),
            ]);

            await logAudit(req, {
                action: 'DELETE_USER',
                targetModel: 'User',
                targetId: user._id,
                severity: 'critical',
                metadata: { email: user.email, name: user.name }
            });

            await session.commitTransaction();
            res.json({ success: true, message: 'User and all data deleted' });
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/users/:id/impersonate', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.role === 'superadmin') return res.status(403).json({ success: false, error: 'Cannot impersonate super admin' });
        
        const token = generateToken(user._id);

        await logAudit(req, {
            action: 'IMPERSONATE_USER',
            targetModel: 'User',
            targetId: user._id,
            severity: 'medium',
            metadata: { adminName: req.user.name, userName: user.name }
        });

        res.json({ 
            success: true, 
            token, 
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                role: user.role, 
                plan: user.plan,
                isImpersonated: true 
            }, 
            message: `Impersonating ${user.name}` 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/users/:id/add-credits', async (req, res) => {
    try {
        const { amount, reason } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ success: false, error: 'Amount must be positive' });
        
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        user.credits.bonus += amount;
        await user.save();

        // Create audit log
        const balanceAfter = (user.credits?.total || 0) + (user.credits?.bonus || 0) - (user.credits?.used || 0);
        await CreditUsage.create({
            user: user._id,
            action: 'admin_adjustment',
            cost: -amount, // Negative cost means addition
            balanceAfter: Math.max(0, balanceAfter),
            description: `Admin Adjustment: ${reason || 'Bonus credits added'}`,
            metadata: {
                adminId: req.user._id,
                reason,
                type: 'bonus'
            }
        }).catch(err => console.warn('Credit audit log failed:', err.message));

        res.json({ success: true, user: { ...user.toJSON(), creditBalance: getCreditBalance(user) } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/users/:id/reset-credits', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const previousUsed = user.credits.used;
        user.credits.used = 0;
        await user.save();

        if (user.activeSubscription) {
            await Subscription.findByIdAndUpdate(user.activeSubscription, { $set: { 'credits.used': 0 } });
        }

        // Create audit log
        const balanceAfter = (user.credits?.total || 0) + (user.credits?.bonus || 0);
        await CreditUsage.create({
            user: user._id,
            action: 'admin_adjustment',
            cost: previousUsed, // Adding back 'used' credits
            balanceAfter: Math.max(0, balanceAfter),
            description: 'Admin Adjustment: Manual Credit Reset',
            metadata: {
                adminId: req.user._id,
                type: 'reset',
                previousUsed
            }
        }).catch(err => console.warn('Credit audit log failed:', err.message));

        res.json({ success: true, user: { ...user.toJSON(), creditBalance: getCreditBalance(user) } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * System-Wide Credit Synchronization
 * Repair tool to ensure all users have correct credit counts based on logs and plans.
 */
router.post('/system/sync-all-credits', async (req, res) => {
    try {
        const { syncUserCredits } = await import('../utils/credits.js');
        const users = await User.find({ role: { $ne: 'superadmin' } });
        
        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
             try {
                 await syncUserCredits(user._id);
                 successCount++;
             } catch (err) {
                 console.error(`Sync failed for user ${user.email}:`, err.message);
                 failCount++;
             }
        }

        res.json({ 
            success: true, 
            message: `Synchronization complete.`, 
            stats: { total: users.length, success: successCount, failed: failCount } 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * Approve User Registration
 */
router.put('/users/:id/approve', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        if (user.approvalStatus === 'approved') {
            return res.status(400).json({ success: false, error: 'User is already approved' });
        }

        user.approvalStatus = 'approved';
        // When approved, we also ensure they are verified if they were pre-verified (like Google users)
        // or just let the normal verification flow continue. 
        // But per requirements, approval is what unlocks login.
        await user.save();

        // Send approval email
        const { sendApprovalEmail } = await import('../utils/email.js');
        try {
            await sendApprovalEmail(user);
        } catch (emailErr) {
            console.error('⚠️ Approval email failed to send:', emailErr.message);
        }

        res.json({ success: true, message: `User ${user.name} has been approved and notified.` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * Reject User Registration
 */
router.put('/users/:id/reject', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        user.approvalStatus = 'rejected';
        await user.save();

        res.json({ success: true, message: `User ${user.name} registration has been rejected.` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 3. SUBSCRIPTION MANAGEMENT
// ══════════════════════════════════════════════════════════════

router.get('/subscriptions', async (req, res) => {
    try {
        const { status, plan } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (plan) filter.plan = plan;
        const subscriptions = await Subscription.find(filter)
            .populate('user', 'name email company plan')
            .populate('couponApplied')
            .sort('-createdAt').limit(100);
        res.json({ success: true, subscriptions });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/subscriptions', async (req, res) => {
    try {
        const { userId, plan, billingCycle, price, credits, notes } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        const planCredits = { starter: 50, professional: 500, enterprise: 999999 };
        const endDate = new Date();
        if (billingCycle === 'monthly') endDate.setMonth(endDate.getMonth() + 1);
        else if (billingCycle === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
        else endDate.setFullYear(endDate.getFullYear() + 100);
        const subscription = await Subscription.create({
            user: userId, plan,
            billingCycle: billingCycle || 'monthly',
            credits: { total: credits || planCredits[plan] || 50, used: 0 },
            price: price || 0, startDate: new Date(), endDate, status: 'active',
            createdBy: req.user._id, notes: notes || '',
        });
        await User.findByIdAndUpdate(userId, {
            plan, activeSubscription: subscription._id,
            'credits.total': credits || planCredits[plan] || 50, 'credits.used': 0,
        });
        res.json({ success: true, subscription });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 4. COUPON MANAGEMENT
// ══════════════════════════════════════════════════════════════

router.get('/coupons', async (req, res) => {
    try {
        const coupons = await Coupon.find().populate('createdBy', 'name email').sort('-createdAt');
        res.json({ success: true, coupons });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/coupons', async (req, res) => {
    try {
        const { code, description, discountType, discountValue, maxUses, maxUsesPerUser, validFrom, validUntil, applicablePlans } = req.body;
        if (!code || !discountType || !discountValue) return res.status(400).json({ success: false, error: 'code, discountType, and discountValue required' });
        const existing = await Coupon.findOne({ code: code.toUpperCase() });
        if (existing) return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        const coupon = await Coupon.create({
            code: code.toUpperCase(), description, discountType, discountValue,
            maxUses: maxUses || 0, maxUsesPerUser: maxUsesPerUser || 1,
            validFrom: validFrom || new Date(), validUntil: validUntil || null,
            applicablePlans: applicablePlans || [], createdBy: req.user._id,
        });
        res.status(201).json({ success: true, coupon });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.put('/coupons/:id', async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!coupon) return res.status(404).json({ success: false, error: 'Coupon not found' });
        res.json({ success: true, coupon });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/coupons/:id', async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Coupon deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 5. CONTENT & BRANDS
// ══════════════════════════════════════════════════════════════

router.get('/brands', async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (search) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [{ name: new RegExp(safeSearch, 'i') }, { website: new RegExp(safeSearch, 'i') }];
        }
        const brands = await Brand.find(filter)
            .populate('user', 'name email')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();
        const total = await Brand.countDocuments(filter);

        // Get content/creative counts per brand
        const brandIds = brands.map(b => b._id);
        const [contentCounts, creativeCounts, productCounts] = await Promise.all([
            Content.aggregate([{ $match: { brand: { $in: brandIds } } }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
            Creative.aggregate([{ $match: { brand: { $in: brandIds } } }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
            Product.aggregate([{ $match: { brand: { $in: brandIds } } }, { $group: { _id: '$brand', count: { $sum: 1 } } }]),
        ]);

        const brandsWithCounts = brands.map(b => {
            const bid = String(b._id);
            return {
                ...b,
                id: bid,
                _id: bid,
                contentCount: contentCounts.find(c => String(c._id) === bid)?.count || 0,
                creativeCount: creativeCounts.find(c => String(c._id) === bid)?.count || 0,
                productCount: productCounts.find(c => String(c._id) === bid)?.count || 0,
            };
        });

        res.json({ success: true, brands: brandsWithCounts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/brands/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, error: 'Brand ID is required' });

        let brand;
        try {
            brand = await Brand.findById(id);
        } catch (err) {
            // Support UUIDs by bypassing Mongoose casting
            brand = await Brand.collection.findOne({ _id: id });
        }

        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const brandId = brand._id;

        await Promise.all([
            Content.collection.deleteMany({ brand: brandId }),
            Creative.collection.deleteMany({ brand: brandId }),
            Product.collection.deleteMany({ brand: brandId }),
            Integration.collection.deleteMany({ brand: brandId }),
            SeoAudit.collection.deleteMany({ brand: brandId }),
            Feedback.collection.deleteMany({ brand: brandId }),
            Brand.collection.deleteOne({ _id: brandId }),
        ]);
        res.json({ success: true, message: 'Brand and all associated data deleted' });
    } catch (error) {
        console.error('DELETE BRAND ERROR:', error);
        res.status(500).json({ success: false, error: 'Deletion failed: ' + (error.message || 'Internal error') });
    }
});

router.get('/content', async (req, res) => {
    try {
        const { type, status, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (type) filter.type = type;
        if (status) filter.status = status;
        const content = await Content.find(filter)
            .populate('user', 'name email')
            .populate('brand', 'name')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();
        const total = await Content.countDocuments(filter);
        const contentWithIds = content.map(c => ({
            ...c,
            id: String(c._id),
            _id: String(c._id)
        }));

        res.json({ success: true, content: contentWithIds, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/content/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, error: 'Content ID is required' });

        let item;
        try {
            item = await Content.findByIdAndDelete(id);
        } catch (err) {
            // Support UUIDs
            item = await Content.collection.findOneAndDelete({ _id: id });
        }

        if (!item) return res.status(404).json({ success: false, error: 'Content not found' });
        res.json({ success: true, message: 'Content deleted' });
    } catch (error) {
        console.error('DELETE CONTENT ERROR:', error);
        res.status(500).json({ success: false, error: 'Deletion failed: ' + (error.message || 'Internal error') });
    }
});

router.get('/creatives', async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (type) filter.type = type;
        const creatives = await Creative.find(filter)
            .populate('user', 'name email')
            .populate('brand', 'name')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        const total = await Creative.countDocuments(filter);
        res.json({ success: true, creatives, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 6. AI & SYSTEM
// ══════════════════════════════════════════════════════════════

router.get('/ai-health', async (req, res) => {
    try {
        const recentFeedback = await Feedback.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
            { $group: { _id: '$signalType', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]);

        const feedbackTrend = await Feedback.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
            { $sort: { _id: 1 } },
        ]);

        const providerUsage = await Feedback.aggregate([
            { $match: { 'context.provider': { $ne: '' } } },
            { $group: { _id: '$context.provider', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]);

        // Check env vars for provider status
        const providers = {
            gemini: !!process.env.GEMINI_API_KEY || !!process.env.GEMINI_IMAGE_API_KEY,
            openai: !!process.env.OPENAI_API_KEY,
            anthropic: !!process.env.ANTHROPIC_API_KEY || !!process.env.CLAUDE_API_KEY,
        };

        res.json({ success: true, aiHealth: { recentFeedback, feedbackTrend, providerUsage, providers, status: 'operational' } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.get('/system-settings', async (req, res) => {
    try {
        const watermarkEnabled = await getSetting('watermark_enabled', true);
        const defaultProvider = await getSetting('default_ai_provider', 'gemini');
        const maintenanceMode = await getSetting('maintenance_mode', false);
        res.json({ success: true, settings: { watermarkEnabled, defaultProvider, maintenanceMode } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.put('/system-settings', async (req, res) => {
    try {
        const { watermarkEnabled, defaultProvider, maintenanceMode } = req.body;
        const before = {};
        const after = {};

        if (watermarkEnabled !== undefined) {
            before.watermarkEnabled = await getSetting('watermark_enabled');
            await setSetting('watermark_enabled', !!watermarkEnabled, req.user._id);
            after.watermarkEnabled = !!watermarkEnabled;
        }
        
        if (defaultProvider) {
            // Whitelist validation for AI providers
            const validProviders = ['gemini', 'openai', 'anthropic', 'mistral'];
            if (!validProviders.includes(defaultProvider.toLowerCase())) {
                return res.status(400).json({ success: false, error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
            }
            before.defaultProvider = await getSetting('default_ai_provider');
            await setSetting('default_ai_provider', defaultProvider.toLowerCase(), req.user._id);
            after.defaultProvider = defaultProvider.toLowerCase();
        }

        if (maintenanceMode !== undefined) {
            before.maintenanceMode = await getSetting('maintenance_mode');
            await setSetting('maintenance_mode', !!maintenanceMode, req.user._id);
            after.maintenanceMode = !!maintenanceMode;
        }

        await logAudit(req, {
            action: 'UPDATE_SYSTEM_SETTINGS',
            targetModel: 'SystemSettings',
            changes: { before, after }
        });

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 7. INTEGRATIONS
// ══════════════════════════════════════════════════════════════

router.get('/integrations', async (req, res) => {
    try {
        const integrations = await Integration.find()
            .populate('user', 'name email')
            .populate('brand', 'name')
            .sort('-createdAt');

        const summary = {
            total: integrations.length,
            byPlatform: {},
            byStatus: {},
        };
        integrations.forEach(i => {
            summary.byPlatform[i.platform] = (summary.byPlatform[i.platform] || 0) + 1;
            summary.byStatus[i.status] = (summary.byStatus[i.status] || 0) + 1;
        });

        res.json({ success: true, integrations, summary });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.get('/products', async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const products = await Product.find()
            .populate('brand', 'name')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        const total = await Product.countDocuments();
        res.json({ success: true, products, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 8. SUBSCRIPTION PACKAGES (AI-Driven Builder)
// ══════════════════════════════════════════════════════════════

// GET /superadmin/packages — list all with dynamic subscriber counts
router.get('/packages', async (req, res) => {
    try {
        const packages = await SubscriptionPackage.find()
            .sort('displayOrder tier')
            .populate('createdBy', 'name email')
            .lean();

        // Dynamically calculate user counts per package slug (plan)
        const userCounts = await User.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } }
        ]);

        const countMap = userCounts.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        const packagesWithCounts = packages.map(pkg => ({
            ...pkg,
            subscriberCount: countMap[pkg.slug] || 0
        }));

        res.json({ success: true, packages: packagesWithCounts });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/packages', async (req, res) => {
    try {
        const data = req.body;
        if (!data.name) return res.status(400).json({ success: false, error: 'Package name required' });
        data.slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        data.createdBy = req.user._id;
        const existing = await SubscriptionPackage.findOne({ slug: data.slug });
        if (existing) return res.status(400).json({ success: false, error: 'Package slug already exists' });
        const pkg = await SubscriptionPackage.create(data);
        
        await logAudit(req, {
            action: 'CREATE_PACKAGE',
            targetModel: 'SubscriptionPackage',
            targetId: pkg._id,
            changes: { after: pkg.toJSON() }
        });

        res.status(201).json({ success: true, package: pkg });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.put('/packages/:id', async (req, res) => {
    try {
        const previous = await SubscriptionPackage.findById(req.params.id);
        if (!previous) return res.status(404).json({ success: false, error: 'Package not found' });

        const pkg = await SubscriptionPackage.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        
        await logAudit(req, {
            action: 'UPDATE_PACKAGE',
            targetModel: 'SubscriptionPackage',
            targetId: pkg._id,
            changes: { before: previous.toJSON(), after: pkg.toJSON() }
        });

        res.json({ success: true, package: pkg });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/packages/:id', async (req, res) => {
    try {
        const pkg = await SubscriptionPackage.findById(req.params.id);
        if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });

        await SubscriptionPackage.findByIdAndDelete(req.params.id);
        
        await logAudit(req, {
            action: 'DELETE_PACKAGE',
            targetModel: 'SubscriptionPackage',
            targetId: pkg._id,
            severity: 'warning',
            metadata: { name: pkg.name, slug: pkg.slug }
        });

        res.json({ success: true, message: 'Package deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// AI-Powered Package Suggestion Engine
router.post('/packages/ai-suggest', async (req, res) => {
    try {
        // Analyze platform usage across all users
        const [totalUsers, totalContent, totalCreatives, totalBrands] = await Promise.all([
            User.countDocuments({ role: { $ne: 'superadmin' } }),
            Content.countDocuments(),
            Creative.countDocuments(),
            Brand.countDocuments(),
        ]);

        // Content type distribution
        const contentByType = await Content.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);

        // User plan distribution
        const planDist = await User.aggregate([
            { $match: { role: { $ne: 'superadmin' } } },
            { $group: { _id: '$plan', count: { $sum: 1 } } },
        ]);

        // Average usage per user
        const avgUsage = await User.aggregate([
            { $match: { role: { $ne: 'superadmin' } } },
            { $group: { _id: null, avgContent: { $avg: '$usage.contentGenerated' }, avgCreatives: { $avg: '$usage.creativesGenerated' }, avgBrands: { $avg: '$usage.brandsCreated' } } },
        ]);

        // SEO audit usage
        const seoUsage = await SeoAudit.countDocuments();

        // Feedback sentiment
        const feedback = await Feedback.aggregate([
            { $group: { _id: '$contentType', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]);

        const avg = avgUsage[0] || { avgContent: 0, avgCreatives: 0, avgBrands: 0 };
        const contentHeavy = (totalContent / Math.max(1, totalUsers)) > 3;
        const creativeHeavy = (totalCreatives / Math.max(1, totalUsers)) > 5;
        const seoActive = seoUsage > totalUsers * 0.3;

        // AI-generated package recommendations
        const suggestions = [
            {
                name: 'Starter',
                slug: 'ai-starter',
                description: 'Perfect for individuals and small brands getting started with AI-powered marketing.',
                tagline: 'Start your AI marketing journey',
                tier: 1,
                studios: { contentStudio: true, creativeStudio: false, seoStudio: false, brainstormStudio: true },
                credits: { monthly: 30, rollover: false, bonusOnSignup: 10 },
                creditCosts: { content: 2, creative: 5, seo: 3, brainstorm: 2, photoshoot: 10 },
                limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 20, maxScheduledPosts: 5, socialIntegrations: 1 },
                features: [
                    { name: 'Content Studio', included: true },
                    { name: 'Brainstorm Studio', included: true },
                    { name: 'Creative Studio', included: false },
                    { name: 'SEO Studio', included: false },
                    { name: '1 Brand Profile', included: true },
                    { name: 'Basic Analytics', included: true },
                    { name: 'Email Support', included: true },
                ],
                pricing: { monthly: 499, yearly: 4999, currency: 'INR' },
                badge: '',
                color: '#64748b',
                icon: 'rocket_launch',
                generatedByAI: true,
                aiRationale: `Based on ${totalUsers} users, most start with content. 30 credits/mo covers ~15 blog posts. Brainstorm included for ideation.`,
            },
            {
                name: 'Professional',
                slug: 'ai-professional',
                description: `Ideal for growing brands. ${contentHeavy ? 'Content-heavy users get expanded limits.' : 'Full studio access for comprehensive marketing.'}`,
                tagline: 'Scale your brand with AI',
                tier: 2,
                studios: { contentStudio: true, creativeStudio: true, seoStudio: contentHeavy || seoActive, brainstormStudio: true },
                credits: { monthly: contentHeavy ? 200 : 100, rollover: true, bonusOnSignup: 25 },
                creditCosts: { content: 2, creative: 4, seo: 3, brainstorm: 2, photoshoot: 8 },
                limits: { maxBrands: 3, maxTeamMembers: 2, maxProducts: 100, maxScheduledPosts: 30, socialIntegrations: 3 },
                features: [
                    { name: 'All Studios', included: true },
                    { name: 'Up to 3 Brands', included: true },
                    { name: `${contentHeavy ? '200' : '100'} Monthly Credits`, included: true },
                    { name: 'Credit Rollover', included: true },
                    { name: '2 Team Members', included: true },
                    { name: '3 Social Integrations', included: true },
                    { name: 'Priority Support', included: true },
                ],
                pricing: { monthly: 1999, yearly: 19999, currency: 'INR' },
                badge: 'POPULAR',
                color: '#6366f1',
                icon: 'trending_up',
                generatedByAI: true,
                aiRationale: `${contentHeavy ? 'High content usage detected — increased to 200 credits/mo.' : 'Balanced usage'} ${creativeHeavy ? 'Creative-heavy users get reduced creative costs (4 instead of 5).' : ''} ${seoActive ? 'SEO active — included SEO Studio.' : ''} Credit rollover rewards consistent users.`,
            },
            {
                name: 'Enterprise',
                slug: 'ai-enterprise',
                description: 'Unlimited AI power for agencies and large brands. Full platform access with priority everything.',
                tagline: 'Unlimited AI marketing power',
                tier: 3,
                studios: { contentStudio: true, creativeStudio: true, seoStudio: true, brainstormStudio: true },
                credits: { monthly: 999999, rollover: true, bonusOnSignup: 100 },
                creditCosts: { content: 1, creative: 3, seo: 2, brainstorm: 1, photoshoot: 5 },
                limits: { maxBrands: 999, maxTeamMembers: 20, maxProducts: 999, maxScheduledPosts: 999, socialIntegrations: 10 },
                features: [
                    { name: 'All Studios — Unlimited', included: true },
                    { name: 'Unlimited Brands', included: true },
                    { name: 'Unlimited Credits', included: true },
                    { name: '20 Team Members', included: true },
                    { name: '10 Social Integrations', included: true },
                    { name: 'Reduced Credit Costs', included: true },
                    { name: 'White-label Options', included: true },
                    { name: 'Dedicated Support', included: true },
                ],
                pricing: { monthly: 4999, yearly: 49999, currency: 'INR' },
                badge: 'BEST VALUE',
                color: '#f59e0b',
                icon: 'diamond',
                generatedByAI: true,
                aiRationale: `Agencies need unlimited access. Reduced credit costs (content: 1, creative: 3) reward volume. Based on ${totalBrands} brands across ${totalUsers} users — heavy users benefit most.`,
            },
        ];

        // Add a niche package if usage patterns show imbalance
        if (creativeHeavy && !contentHeavy) {
            suggestions.push({
                name: 'Creative Pro',
                slug: 'ai-creative-pro',
                description: 'Built for visual-first brands. Extra creative credits and AI photoshoot access.',
                tagline: 'Visual-first AI marketing',
                tier: 2,
                studios: { contentStudio: true, creativeStudio: true, seoStudio: false, brainstormStudio: true },
                credits: { monthly: 150, rollover: true, bonusOnSignup: 20 },
                creditCosts: { content: 2, creative: 3, seo: 3, brainstorm: 2, photoshoot: 5 },
                limits: { maxBrands: 2, maxTeamMembers: 1, maxProducts: 200, maxScheduledPosts: 20, socialIntegrations: 3 },
                features: [
                    { name: 'Creative Studio — Premium', included: true },
                    { name: 'AI Photoshoot (Reduced Cost)', included: true },
                    { name: '150 Monthly Credits', included: true },
                    { name: 'Product Catalog (200)', included: true },
                ],
                pricing: { monthly: 1499, yearly: 14999, currency: 'INR' },
                badge: 'FOR CREATORS',
                color: '#ec4899',
                icon: 'palette',
                generatedByAI: true,
                aiRationale: `Creative usage (${totalCreatives} creatives) is ${(totalCreatives / Math.max(1, totalContent)).toFixed(1)}x content usage — users want a visual-first plan with cheaper creative/photoshoot costs.`,
            });
        }

        if (seoActive) {
            suggestions.push({
                name: 'SEO Growth',
                slug: 'ai-seo-growth',
                description: 'Content + SEO powerhouse for brands focused on organic growth.',
                tagline: 'Dominate search rankings',
                tier: 2,
                studios: { contentStudio: true, creativeStudio: false, seoStudio: true, brainstormStudio: true },
                credits: { monthly: 120, rollover: true, bonusOnSignup: 15 },
                creditCosts: { content: 2, creative: 5, seo: 2, brainstorm: 2, photoshoot: 10 },
                limits: { maxBrands: 2, maxTeamMembers: 1, maxProducts: 50, maxScheduledPosts: 20, socialIntegrations: 2 },
                features: [
                    { name: 'SEO Studio — Full Access', included: true },
                    { name: 'Content Studio', included: true },
                    { name: 'Competitor Tracking', included: true },
                    { name: 'AI Visibility Score', included: true },
                ],
                pricing: { monthly: 1299, yearly: 12999, currency: 'INR' },
                badge: 'SEO FOCUSED',
                color: '#10b981',
                icon: 'query_stats',
                generatedByAI: true,
                aiRationale: `${seoUsage} SEO audits detected — users actively using SEO. Reduced SEO credit cost (2 instead of 3) to encourage more audits.`,
            });
        }

        res.json({
            success: true,
            suggestions,
            analytics: {
                totalUsers, totalContent, totalCreatives, totalBrands, seoUsage,
                avgContentPerUser: avg.avgContent?.toFixed(1),
                avgCreativesPerUser: avg.avgCreatives?.toFixed(1),
                contentHeavy, creativeHeavy, seoActive,
                planDistribution: planDist,
                contentByType,
                feedbackByType: feedback,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Seed default packages
router.post('/packages/seed-defaults', async (req, res) => {
    try {
        const result = await SubscriptionPackage.countDocuments();
        if (result > 0 && !req.body.force) {
            return res.json({ success: false, error: 'Packages already exist. Send force: true to overwrite.' });
        }
        if (req.body.force) await SubscriptionPackage.deleteMany({});

        const defaults = [
            {
                name: 'Starter', slug: 'starter', tagline: 'Get started with AI marketing', tier: 1,
                studios: { contentStudio: true, creativeStudio: false, seoStudio: false, brainstormStudio: true },
                credits: { monthly: 50, rollover: false, bonusOnSignup: 10 },
                limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 20, maxScheduledPosts: 5, socialIntegrations: 1 },
                features: [{ name: 'Content Studio', included: true }, { name: 'Brainstorm Studio', included: true }, { name: '50 Monthly Credits', included: true }, { name: 'Creative Studio', included: false }, { name: 'SEO Studio', included: false }],
                pricing: { monthly: 999, quarterly: 2699, yearly: 9599 }, badge: '', color: '#64748b', icon: 'rocket_launch', isDefault: true, displayOrder: 1,
                createdBy: req.user._id,
            },
            {
                name: 'Professional', slug: 'professional', tagline: 'Scale your brand with AI', tier: 2,
                studios: { contentStudio: true, creativeStudio: true, seoStudio: true, brainstormStudio: true },
                credits: { monthly: 200, rollover: true, bonusOnSignup: 50 },
                limits: { maxBrands: 3, maxTeamMembers: 3, maxProducts: 200, maxScheduledPosts: 50, socialIntegrations: 5 },
                features: [{ name: 'All 4 Studios', included: true }, { name: '200 Monthly Credits', included: true }, { name: 'Credit Rollover', included: true }, { name: '3 Team Members', included: true }, { name: 'AI Photoshoot', included: true }],
                pricing: { monthly: 2499, quarterly: 6749, yearly: 23999 }, badge: 'POPULAR', color: '#6366f1', icon: 'trending_up', displayOrder: 2,
                createdBy: req.user._id,
            },
            {
                name: 'Enterprise', slug: 'enterprise', tagline: 'Unlimited AI power for agencies', tier: 3,
                studios: { contentStudio: true, creativeStudio: true, seoStudio: true, brainstormStudio: true },
                credits: { monthly: 999999, rollover: true, bonusOnSignup: 200 },
                creditCosts: { content: 1, creative: 3, seo: 2, brainstorm: 1, photoshoot: 5 },
                limits: { maxBrands: 999, maxTeamMembers: 10, maxProducts: 999, maxScheduledPosts: 999, socialIntegrations: 10 },
                features: [{ name: 'Unlimited Credits', included: true }, { name: 'Reduced Credit Costs', included: true }, { name: '10 Team Members', included: true }, { name: 'Priority Support', included: true }, { name: 'White-Label Reports', included: true }],
                pricing: { monthly: 6999, quarterly: 18899, yearly: 67199 }, badge: 'BEST VALUE', color: '#f59e0b', icon: 'diamond', displayOrder: 3,
                createdBy: req.user._id,
            },
        ];

        const created = await SubscriptionPackage.insertMany(defaults);
        res.json({ success: true, packages: created, message: `${created.length} default packages created` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 9. CREDIT COST MANAGEMENT (Super Admin)
// ══════════════════════════════════════════════════════════════

// GET /superadmin/credit-costs — Current credit costs
router.get('/credit-costs', async (req, res) => {
    try {
        const costs = await getCreditCosts();
        res.json({ success: true, costs, defaults: CREDIT_COSTS });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/credit-costs — Update credit costs
router.put('/credit-costs', async (req, res) => {
    try {
        const { costs } = req.body;
        if (!costs || typeof costs !== 'object') {
            return res.status(400).json({ success: false, error: 'costs object required' });
        }
        // Validate all values are positive numbers
        for (const [key, value] of Object.entries(costs)) {
            if (typeof value !== 'number' || value < 0) {
                return res.status(400).json({ success: false, error: `Invalid cost for ${key}: must be a positive number` });
            }
        }
        await SystemSettings.findOneAndUpdate(
            { key: 'creditCosts' },
            { key: 'creditCosts', value: costs, updatedBy: req.user._id },
            { upsert: true, returnDocument: 'after' }
        );
        invalidateCreditCostCache();
        const updated = await getCreditCosts();
        res.json({ success: true, costs: updated, message: 'Credit costs updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/credit-costs/reset — Reset to defaults
router.post('/credit-costs/reset', async (req, res) => {
    try {
        await SystemSettings.deleteOne({ key: 'creditCosts' });
        invalidateCreditCostCache();
        res.json({ success: true, costs: CREDIT_COSTS, message: 'Reset to defaults' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// CREDIT BALANCE (public, protect only)
// ══════════════════════════════════════════════════════════════

export const creditRouter = Router();

creditRouter.get('/balance', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const costs = await getCreditCosts();
        res.json({ success: true, ...getCreditBalance(user), plan: user.plan, costs });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/credits/usage — paginated usage history
creditRouter.get('/usage', protect, async (req, res) => {
    try {
        const CreditUsage = (await import('../models/CreditUsage.js')).default;
        const { page = 1, limit = 20, days = 30 } = req.query;
        const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        const [records, total] = await Promise.all([
            CreditUsage.find({ user: req.user._id, createdAt: { $gte: since } })
                .sort({ createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            CreditUsage.countDocuments({ user: req.user._id, createdAt: { $gte: since } }),
        ]);

        res.json({ success: true, records, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/credits/summary — usage breakdown (today, week, month, by action)
creditRouter.get('/summary', protect, async (req, res) => {
    try {
        const CreditUsage = (await import('../models/CreditUsage.js')).default;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(todayStart); monthStart.setDate(monthStart.getDate() - 30);

        const [todayUsage, weekUsage, monthUsage, byAction] = await Promise.all([
            CreditUsage.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.user._id), createdAt: { $gte: todayStart } } },
                { $group: { _id: null, total: { $sum: '$cost' }, count: { $sum: 1 } } },
            ]),
            CreditUsage.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.user._id), createdAt: { $gte: weekStart } } },
                { $group: { _id: null, total: { $sum: '$cost' }, count: { $sum: 1 } } },
            ]),
            CreditUsage.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.user._id), createdAt: { $gte: monthStart } } },
                { $group: { _id: null, total: { $sum: '$cost' }, count: { $sum: 1 } } },
            ]),
            CreditUsage.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.user._id), createdAt: { $gte: monthStart } } },
                { $group: { _id: '$action', total: { $sum: '$cost' }, count: { $sum: 1 }, description: { $first: '$description' } } },
                { $sort: { total: -1 } },
            ]),
        ]);

        // Daily trend (last 7 days)
        const dailyTrend = await CreditUsage.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(req.user._id), createdAt: { $gte: weekStart } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$cost' }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);

        const user = await User.findById(req.user._id);
        const balance = getCreditBalance(user);

        res.json({
            success: true,
            balance: {
                ...balance,
                plan: user.plan // Include current plan slug for the UI
            },
            today: { credits: todayUsage[0]?.total || 0, operations: todayUsage[0]?.count || 0 },
            week: { credits: weekUsage[0]?.total || 0, operations: weekUsage[0]?.count || 0 },
            month: { credits: monthUsage[0]?.total || 0, operations: monthUsage[0]?.count || 0 },
            byAction,
            dailyTrend,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// TOKEN USAGE ANALYTICS (Super Admin)
// ══════════════════════════════════════════════════════════════

router.get('/stats/token-usage', async (req, res) => {
    try {
        const CreditUsage = (await import('../models/CreditUsage.js')).default;
        const { days = 30 } = req.query;
        const since = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

        const [byStudio, byModel, byUser, dailyTrend, totals] = await Promise.all([
            // Per-studio breakdown
            CreditUsage.aggregate([
                { $match: { createdAt: { $gte: since }, 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: '$studio',
                    totalTokens: { $sum: '$tokenUsage.totalTokens' },
                    inputTokens: { $sum: '$tokenUsage.inputTokens' },
                    outputTokens: { $sum: '$tokenUsage.outputTokens' },
                    estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                    calls: { $sum: 1 },
                    credits: { $sum: '$cost' },
                }},
                { $sort: { totalTokens: -1 } },
            ]),
            // Per-model breakdown
            CreditUsage.aggregate([
                { $match: { createdAt: { $gte: since }, 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: { model: '$tokenUsage.model', provider: '$tokenUsage.provider' },
                    totalTokens: { $sum: '$tokenUsage.totalTokens' },
                    inputTokens: { $sum: '$tokenUsage.inputTokens' },
                    outputTokens: { $sum: '$tokenUsage.outputTokens' },
                    estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                    calls: { $sum: 1 },
                }},
                { $sort: { totalTokens: -1 } },
            ]),
            // Top token consumers (users)
            CreditUsage.aggregate([
                { $match: { createdAt: { $gte: since }, 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: '$user',
                    totalTokens: { $sum: '$tokenUsage.totalTokens' },
                    estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                    calls: { $sum: 1 },
                    credits: { $sum: '$cost' },
                }},
                { $sort: { totalTokens: -1 } },
                { $limit: 15 },
                { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
                { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
                { $project: { totalTokens: 1, estimatedCost: 1, calls: 1, credits: 1, name: '$userInfo.name', email: '$userInfo.email', plan: '$userInfo.plan' } },
            ]),
            // Daily trend
            CreditUsage.aggregate([
                { $match: { createdAt: { $gte: since }, 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    totalTokens: { $sum: '$tokenUsage.totalTokens' },
                    estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                    calls: { $sum: 1 },
                }},
                { $sort: { _id: 1 } },
            ]),
            // Overall totals
            CreditUsage.aggregate([
                { $match: { createdAt: { $gte: since }, 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: null,
                    totalTokens: { $sum: '$tokenUsage.totalTokens' },
                    inputTokens: { $sum: '$tokenUsage.inputTokens' },
                    outputTokens: { $sum: '$tokenUsage.outputTokens' },
                    estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                    totalCalls: { $sum: 1 },
                    totalCredits: { $sum: '$cost' },
                }},
            ]),
            // Lifetime Provider consumption for budget tracking
            CreditUsage.aggregate([
                { $match: { 'tokenUsage.totalTokens': { $gt: 0 } } },
                { $group: {
                    _id: '$tokenUsage.provider',
                    totalConsumed: { $sum: '$tokenUsage.estimatedCost' },
                    totalTokens: { $sum: '$tokenUsage.totalTokens' }
                }}
            ])
        ]);

        // Get budgets from settings
        const providerBudgets = await getSetting('ai_provider_budgets', {
          anthropic: 0,
          openai: 0,
          gemini: 0,
          xai: 0,
          grok: 0, // Explicitly add grok
          sarvam: 0
        });

        // Get revenue for profitability
        const revenue = await Subscription.aggregate([
            { $match: { status: 'active', price: { $gt: 0 } } },
            { $group: { _id: null, total: { $sum: '$price' } } },
        ]);

        const t = totals[0] || {};
        const monthlyRevenue = revenue[0]?.total || 0;

        res.json({
            success: true,
            period: `${days} days`,
            totals: {
                totalTokens: t.totalTokens || 0,
                inputTokens: t.inputTokens || 0,
                outputTokens: t.outputTokens || 0,
                estimatedCostUSD: Math.round((t.estimatedCost || 0) * 100) / 100,
                totalCalls: t.totalCalls || 0,
                totalCredits: t.totalCredits || 0,
            },
            profitability: {
                monthlyRevenue,
                estimatedCostINR: Math.round((t.estimatedCost || 0) * 85), // approx USD→INR
                margin: monthlyRevenue > 0 ? Math.round(((monthlyRevenue - (t.estimatedCost || 0) * 85) / monthlyRevenue) * 100) : 0,
            },
            providerWallets: Object.keys(providerBudgets).map(p => {
              const stats = (totals[1] || []).find(s => s._id === p) || {};
              return {
                provider: p,
                consumed: Math.round((stats.totalConsumed || 0) * 100) / 100,
                tokens: stats.totalTokens || 0,
                budget: providerBudgets[p] || 0
              };
            }),
            byStudio,
            byModel,
            topUsers: byUser,
            dailyTrend,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// 9.5 UPDATE PROVIDER BUDGETS
router.put('/settings/provider-budgets', async (req, res) => {
    try {
        const { budgets } = req.body;
        if (!budgets || typeof budgets !== 'object') {
            return res.status(400).json({ success: false, error: 'budgets object required' });
        }
        await setSetting('ai_provider_budgets', budgets, req.user._id);
        res.json({ success: true, message: 'Provider budgets updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 10. SYSTEM AUDIT LOGS
// ══════════════════════════════════════════════════════════════

// GET /superadmin/system-logs — paginated audit trails
router.get('/system-logs', async (req, res) => {
    try {
        const { page = 1, limit = 50, action, adminId, severity } = req.query;
        const query = {};
        if (action) query.action = action;
        if (adminId) query.admin = adminId;
        if (severity) query.severity = severity;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .populate('admin', 'name email image')
                .sort({ createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit))
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
