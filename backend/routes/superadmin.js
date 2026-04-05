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
import Waitlist from '../models/Waitlist.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import SystemSettings, { getSetting, setSetting } from '../models/SystemSettings.js';
import AuditLog from '../models/AuditLog.js';
import RetentionOffer from '../models/RetentionOffer.js';
import { CREDIT_COSTS, getCreditCosts, getCreditBalance, invalidateCreditCostCache, MODEL_COSTS } from '../middleware/credits.js';
import { protect, authorize, generateToken } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { logAudit } from '../utils/audit.js';
import CreditUsage from '../models/CreditUsage.js';
import { uploadToS3 } from '../utils/s3.js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import env from '../config/env.js';
import { getOnPageProviderStatus } from '../utils/onpage-api.js';
import { getDataForSEOProviderStatus } from '../utils/dataforseo.js';
import { getRedisStatus } from '../utils/cache.js';

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

/**
 * Platform Provider Status — Live health check of all external APIs/DBs
 */
router.get('/provider-status', async (req, res) => {
    try {
        const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        const redisStatus = getRedisStatus();
        const onPageStatus = getOnPageProviderStatus();
        const labsStatus = getDataForSEOProviderStatus();

        res.json({
            success: true,
            providers: {
                mongodb: { status: mongoStatus, dbName: mongoose.connection.name },
                redis: redisStatus,
                dataforseo: {
                    onPage: onPageStatus,
                    labs: labsStatus,
                    overallStatus: (onPageStatus.suspended || labsStatus.suspended) ? 'degraded' : 'healthy',
                    message: (onPageStatus.suspended || labsStatus.suspended) ? 'Account balance exhausted. API suspended for 1 hour.' : 'Fully operational'
                },
                env: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 1. PLATFORM OVERVIEW
// ══════════════════════════════════════════════════════════════

router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalBrands, totalContent, totalCreatives, totalProducts, totalIntegrations, totalSubscriptions, totalCoupons, totalFeedback, totalSeoAudits, totalWaitlist] = await Promise.all([
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
            Waitlist.countDocuments({ status: { $ne: 'registered' } }),
        ]);

        const planDistribution = await User.aggregate([
            { $group: { _id: '$plan', count: { $sum: 1 } } },
        ]).allowDiskUse(true);

        const revenueData = await Subscription.aggregate([
            { $match: { status: 'active', price: { $gt: 0 } } },
            { $group: { _id: null, totalRevenue: { $sum: '$price' }, count: { $sum: 1 } } },
        ]).allowDiskUse(true);

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
        ]).allowDiskUse(true);

        // Content by type
        const contentByType = await Content.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);

        // Feedback sentiment
        const feedbackSentiment = await Feedback.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: '$signalType', count: { $sum: 1 }, avgSentiment: { $avg: '$sentimentScore' } } },
        ]).allowDiskUse(true);

        // Users created per day (last 30 days)
        const userGrowth = await User.aggregate([
            { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]).allowDiskUse(true);

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
            ]).allowDiskUse(true)
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
                totalIntegrations, totalSubscriptions, totalCoupons, totalFeedback, totalSeoAudits, totalWaitlist,
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
        if (approvalStatus) {
            if (approvalStatus === 'pending') {
                filter.$and = filter.$and || [];
                filter.$and.push({ $or: [{ approvalStatus: 'pending' }, { approvalStatus: { $exists: false } }, { approvalStatus: null }] });
            } else {
                filter.approvalStatus = approvalStatus;
            }
        }

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

router.get('/waitlist', async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const filter = { status: { $ne: 'registered' } };
        const entries = await Waitlist.find(filter)
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        const total = await Waitlist.countDocuments(filter);
        res.json({ success: true, waitlist: entries, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/waitlist/:id/approve', async (req, res) => {
    try {
        const entry = await Waitlist.findById(req.params.id);
        if (!entry) return res.status(404).json({ success: false, error: 'Waitlist entry not found' });

        // Generate invitation link (prioritize production URL over localhost)
        const productionUrl = env.frontendUrl.find(url => url.includes('mantram.ai')) || env.frontendUrl[0] || 'https://mantram.ai';
        const inviteLink = `${productionUrl}/signup?email=${encodeURIComponent(entry.email)}`;
        
        const mailOptions = {
            from: `"Mantram AI" <${env.email.user}>`,
            to: entry.email,
            subject: 'Good news! Your early access to Mantram AI is here ✨',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #6366f1;">You're off the waitlist! 🎉</h2>
                    <p>Hi ${entry.name.split(' ')[0]},</p>
                    <p>We're thrilled to invite you to join <strong>Mantram AI</strong>. Your early access request has been approved!</p>
                    <p>You can now create your workspace and start building with our AI agents.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${inviteLink}" style="background-color: #6366f1; color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">Get Started Now</a>
                    </div>
                    <p>If you have any questions, just reply to this email.</p>
                    <br>
                    <p>See you inside,</p>
                    <p><strong>The Mantram AI Team</strong></p>
                </div>
            `
        };

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: env.email.user, pass: env.email.pass }
        });

        await transporter.sendMail(mailOptions);
        
        // Update waitlist entry status
        entry.status = 'invited';
        entry.invitedAt = new Date();
        await entry.save();
        
        res.json({ success: true, message: 'Invitation email sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/waitlist/:id', async (req, res) => {
    try {
        await Waitlist.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Waitlist entry deleted' });
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
            severity: 'warning',
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
// 3b. RETENTION OFFER MANAGEMENT
// ══════════════════════════════════════════════════════════════

router.get('/retention-offers', async (req, res) => {
    try {
        const offers = await RetentionOffer.find()
            .populate('createdBy', 'name email')
            .sort('-priority');
        res.json({ success: true, offers });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.post('/retention-offers', async (req, res) => {
    try {
        const offer = await RetentionOffer.create({
            ...req.body,
            createdBy: req.user._id,
        });
        await logAudit(req, { action: 'CREATE_RETENTION_OFFER', targetModel: 'RetentionOffer', targetId: offer._id });
        res.status(201).json({ success: true, offer });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.put('/retention-offers/:id', async (req, res) => {
    try {
        const offer = await RetentionOffer.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });
        res.json({ success: true, offer });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

router.delete('/retention-offers/:id', async (req, res) => {
    try {
        await RetentionOffer.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Retention offer deleted' });
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
        const { code, description, discountType, discountValue, maxUses, maxUsesPerUser, validFrom, validUntil, applicablePlans, minPurchase } = req.body;
        if (!code || !discountType || !discountValue) return res.status(400).json({ success: false, error: 'code, discountType, and discountValue required' });
        const existing = await Coupon.findOne({ code: code.toUpperCase() });
        if (existing) return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        const coupon = await Coupon.create({
            code: code.toUpperCase(), description, discountType, discountValue,
            maxUses: maxUses || 0, maxUsesPerUser: maxUsesPerUser || 1,
            minPurchase: minPurchase || 0,
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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

// ══════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ══════════════════════════════════════════════════════════════

// Provider definitions with env var mappings
const API_PROVIDERS = {
    gemini:    { label: 'Google Gemini', fields: [{ key: 'apiKey', env: 'GEMINI_API_KEY', label: 'API Key' }, { key: 'imageApiKey', env: 'GEMINI_IMAGE_API_KEY', label: 'Image API Key' }], testUrl: 'https://generativelanguage.googleapis.com/v1beta/models?key=__KEY__', icon: 'diamond' },
    openai:    { label: 'OpenAI', fields: [{ key: 'apiKey', env: 'OPENAI_API_KEY', label: 'API Key' }], testUrl: 'https://api.openai.com/v1/models', testHeader: 'Bearer', icon: 'psychology' },
    anthropic: { label: 'Anthropic (Claude)', fields: [{ key: 'apiKey', env: 'ANTHROPIC_API_KEY', label: 'API Key' }], testUrl: 'https://api.anthropic.com/v1/models', testHeader: 'x-api-key', icon: 'smart_toy' },
    grok:      { label: 'xAI (Grok)', fields: [{ key: 'apiKey', env: 'GROK_API_KEY', label: 'API Key' }], testUrl: 'https://api.x.ai/v1/models', testHeader: 'Bearer', icon: 'bolt' },
    piapi:     { label: 'PiAPI (Seedance)', fields: [{ key: 'apiKey', env: 'PIAPI_API_KEY', label: 'API Key' }], testUrl: 'https://api.piapi.ai/api/v1/account', testHeader: 'Bearer', icon: 'movie' },
    muapi:     { label: 'MuAPI (Seedance)', fields: [{ key: 'apiKey', env: 'MUAPI_API_KEY', label: 'API Key' }], testUrl: 'https://api.muapi.ai/api/v1/predictions/test/result', testHeader: 'x-api-key', icon: 'movie_filter' },
    fal:       { label: 'fal.ai (Kling)', fields: [{ key: 'apiKey', env: 'FAL_API_KEY', label: 'API Key' }], testUrl: 'https://queue.fal.run/fal-ai/fast-sdxl', testHeader: 'Key', icon: 'videocam' },
    heygen:    { label: 'HeyGen (UGC)', fields: [{ key: 'apiKey', env: 'HEYGEN_API_KEY', label: 'API Key' }], testUrl: 'https://api.heygen.com/v2/user/remaining_quota', testHeader: 'x-api-key', icon: 'person_play' },
    kie:       { label: 'kie.ai (Veo)', fields: [{ key: 'apiKey', env: 'KIE_API_KEY', label: 'API Key' }], icon: 'play_circle' },
    sarvam:    { label: 'Sarvam AI', fields: [{ key: 'apiKey', env: 'SARVAM_API_KEY', label: 'API Key' }], testUrl: 'https://api.sarvam.ai/text-to-speech', testHeader: 'api-subscription-key', icon: 'record_voice_over' },
    aws:       { label: 'AWS S3', fields: [{ key: 'accessKeyId', env: 'AWS_ACCESS_KEY_ID', label: 'Access Key ID' }, { key: 'secretAccessKey', env: 'AWS_SECRET_ACCESS_KEY', label: 'Secret Key' }, { key: 'bucket', env: 'AWS_S3_BUCKET', label: 'Bucket' }, { key: 'region', env: 'AWS_REGION', label: 'Region' }], icon: 'cloud_upload' },
    razorpay:  { label: 'Razorpay', fields: [{ key: 'keyId', env: 'RAZORPAY_KEY_ID', label: 'Key ID' }, { key: 'keySecret', env: 'RAZORPAY_KEY_SECRET', label: 'Key Secret' }], icon: 'payments' },
};

const maskKey = (key) => key && key.length > 4 ? '•'.repeat(key.length - 4) + key.slice(-4) : key ? '••••' : '';

// GET /superadmin/api-keys — list all providers with masked keys
router.get('/api-keys', async (req, res) => {
    try {
        const storedKeys = await getSetting('api_keys', {});
        const providers = Object.entries(API_PROVIDERS).map(([id, p]) => {
            const fields = p.fields.map(f => {
                const dbValue = storedKeys[id]?.[f.key];
                const envValue = process.env[f.env];
                const value = dbValue || envValue || '';
                return { key: f.key, label: f.label, source: dbValue ? 'database' : envValue ? 'env' : 'none', masked: maskKey(value), hasValue: !!value };
            });
            return { id, label: p.label, icon: p.icon, fields, canTest: !!p.testUrl };
        });
        res.json({ success: true, providers });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/api-keys — update provider keys
router.put('/api-keys', async (req, res) => {
    try {
        const { provider, keys } = req.body;
        if (!provider || !API_PROVIDERS[provider]) return res.status(400).json({ success: false, error: 'Invalid provider' });
        if (!keys || typeof keys !== 'object') return res.status(400).json({ success: false, error: 'Keys object required' });

        const storedKeys = await getSetting('api_keys', {});
        storedKeys[provider] = { ...(storedKeys[provider] || {}), ...keys };
        await setSetting('api_keys', storedKeys, req.user._id);

        await logAudit(req, { action: 'UPDATE_API_KEY', targetModel: 'SystemSettings', targetId: provider, severity: 'high', metadata: { provider, fields: Object.keys(keys) } });
        res.json({ success: true, message: `${API_PROVIDERS[provider].label} keys updated` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /superadmin/api-keys/:provider — remove provider keys
router.delete('/api-keys/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        if (!API_PROVIDERS[provider]) return res.status(400).json({ success: false, error: 'Invalid provider' });

        const storedKeys = await getSetting('api_keys', {});
        delete storedKeys[provider];
        await setSetting('api_keys', storedKeys, req.user._id);

        await logAudit(req, { action: 'DELETE_API_KEY', targetModel: 'SystemSettings', targetId: provider, severity: 'high', metadata: { provider } });
        res.json({ success: true, message: `${API_PROVIDERS[provider].label} keys removed from database (env vars still apply)` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/api-keys/:provider/test — test provider connectivity
router.post('/api-keys/:provider/test', async (req, res) => {
    try {
        const { provider } = req.params;
        const pConfig = API_PROVIDERS[provider];
        if (!pConfig) return res.status(400).json({ success: false, error: 'Invalid provider' });
        if (!pConfig.testUrl) return res.json({ success: true, status: 'untestable', message: 'No test endpoint available for this provider' });

        const storedKeys = await getSetting('api_keys', {});
        const apiKey = storedKeys[provider]?.apiKey || process.env[pConfig.fields[0].env] || '';
        if (!apiKey) return res.json({ success: false, status: 'no_key', message: 'No API key configured' });

        const headers = { 'Content-Type': 'application/json' };
        let url = pConfig.testUrl;

        if (pConfig.testUrl.includes('__KEY__')) {
            url = pConfig.testUrl.replace('__KEY__', apiKey);
        } else if (pConfig.testHeader === 'Bearer') {
            headers['Authorization'] = `Bearer ${apiKey}`;
        } else if (pConfig.testHeader === 'x-api-key') {
            headers['x-api-key'] = apiKey;
        } else if (pConfig.testHeader === 'Key') {
            headers['Authorization'] = `Key ${apiKey}`;
        } else if (pConfig.testHeader === 'api-subscription-key') {
            headers['api-subscription-key'] = apiKey;
        }

        // Add anthropic version header
        if (provider === 'anthropic') {
            headers['anthropic-version'] = '2023-06-01';
        }

        const controller = new AbortController();
        try { setMaxListeners(30, controller.signal); } catch (e) {}
        const timer = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timer);

        if (resp.ok || resp.status === 405 || resp.status === 200) {
            res.json({ success: true, status: 'connected', message: `${pConfig.label} API is reachable`, httpStatus: resp.status });
        } else {
            const body = await resp.text().catch(() => '');
            res.json({ success: false, status: 'error', message: `${pConfig.label} returned ${resp.status}`, httpStatus: resp.status, detail: body.slice(0, 200) });
        }
    } catch (error) {
        res.json({ success: false, status: 'unreachable', message: error.name === 'AbortError' ? 'Connection timed out (10s)' : error.message });
    }
});

router.get('/system-settings', async (req, res) => {
    try {
        const watermarkEnabled = await getSetting('watermark_enabled', true);
        const defaultProvider = await getSetting('default_ai_provider', 'gemini');
        const maintenanceMode = await getSetting('maintenance_mode', false);
        const watermarkLogoUrl = await getSetting('watermark_logo_url', '');
        const watermarkPosition = await getSetting('watermark_position', 'bottom-right');
        const watermarkOpacity = await getSetting('watermark_opacity', 0.4);
        const watermarkOverrides = await getSetting('watermark_overrides', {});
        const showSubscriptionPlans = await getSetting('show_subscription_plans', true);
        const showCreditPacks = await getSetting('show_credit_packs', true);
        res.json({ success: true, settings: { watermarkEnabled, defaultProvider, maintenanceMode, watermarkLogoUrl, watermarkPosition, watermarkOpacity, watermarkOverrides, showSubscriptionPlans, showCreditPacks } });
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

        if (req.body.showSubscriptionPlans !== undefined) {
            before.showSubscriptionPlans = await getSetting('show_subscription_plans');
            await setSetting('show_subscription_plans', !!req.body.showSubscriptionPlans, req.user._id);
            after.showSubscriptionPlans = !!req.body.showSubscriptionPlans;
        }

        if (req.body.showCreditPacks !== undefined) {
            before.showCreditPacks = await getSetting('show_credit_packs');
            await setSetting('show_credit_packs', !!req.body.showCreditPacks, req.user._id);
            after.showCreditPacks = !!req.body.showCreditPacks;
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
// VIDEO PROVIDER MANAGEMENT — Global API Switcher
// Manage ALL video model providers: add, remove, switch, modify
// ══════════════════════════════════════════════════════════════

// ── Default registry: ALL video models with their known providers ──
// This serves as the base template; custom providers stored in DB are merged in
const VIDEO_PROVIDER_REGISTRY = {
    'seedance-2.0': {
        name: 'Seedance 2.0 Pro',
        icon: 'movie_filter',
        category: 'cinematic',
        defaultProvider: 'muapi',
        providers: [
            { id: 'muapi', name: 'MuAPI', envKey: 'MUAPI_API_KEY', costPerSecond: 0.12, description: 'Primary — reliable, 5/10/15s, async polling', builtIn: true },
            { id: 'piapi', name: 'PiAPI', envKey: 'PIAPI_API_KEY', costPerSecond: 0.08, description: 'Legacy — intermittent 10000 errors', builtIn: true },
        ],
    },
    'kling-3.0': {
        name: 'Kling 3.0',
        icon: 'movie',
        category: 'motion',
        defaultProvider: 'fal',
        providers: [
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerSecond: 0.07, description: 'Primary — queue-based async, multi-shot + audio', builtIn: true },
            { id: 'laozhang', name: 'LaoZhang', envKey: 'LAOZHANG_API_KEY', costPerSecond: 0.05, description: 'Cheaper — 503 on some billing channels', builtIn: true },
        ],
    },
    'veo-3.1': {
        name: 'Google Veo 3.1',
        icon: 'smart_display',
        category: 'cinematic',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang', envKey: 'LAOZHANG_API_KEY', costPerSecond: 0.10, description: 'Primary — cheapest, sync return', builtIn: true },
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerSecond: 0.25, description: 'Fallback — queue-based, higher quality', builtIn: true },
        ],
    },
    'veo-3.1-fast': {
        name: 'Veo 3.1 Fast',
        icon: 'bolt',
        category: 'fast',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang', envKey: 'LAOZHANG_API_KEY', costPerSecond: 0.06, description: 'Primary — cheapest, sync return', builtIn: true },
            { id: 'kie', name: 'kie.ai', envKey: 'KIE_API_KEY', costPerSecond: 0.08, description: 'Fallback — taskId-based async', builtIn: true },
        ],
    },
    'seedance-1.0': {
        name: 'Seedance 1.0 Lite',
        icon: 'play_circle',
        category: 'budget',
        defaultProvider: 'fal',
        providers: [
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerSecond: 0.05, description: 'Only provider — queue-based async', builtIn: true },
        ],
    },
    'grok-imagine': {
        name: 'Grok Imagine',
        icon: 'auto_awesome',
        category: 'experimental',
        defaultProvider: 'grok',
        providers: [
            { id: 'grok', name: 'xAI (Grok)', envKey: 'GROK_API_KEY', costPerSecond: 0.08, description: 'Native xAI API — fast, 1-15s', builtIn: true },
        ],
    },
    'hunyuan': {
        name: 'HunyuanVideo',
        icon: 'palette',
        category: 'budget',
        defaultProvider: 'fal',
        providers: [
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerSecond: 0.03, description: 'Only provider — cheapest draft tier', builtIn: true },
        ],
    },
    'sora-2': {
        name: 'Sora 2',
        icon: 'theaters',
        category: 'cinematic',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang', envKey: 'LAOZHANG_API_KEY', costPerSecond: 0.10, description: 'Only provider — OpenAI via LZ gateway', builtIn: true },
        ],
    },
};

// Category labels for UI grouping
const CATEGORY_LABELS = {
    cinematic: { label: 'Cinematic', color: 'violet', icon: 'theaters' },
    motion: { label: 'Motion & Action', color: 'cyan', icon: 'animation' },
    fast: { label: 'Fast & Affordable', color: 'emerald', icon: 'bolt' },
    budget: { label: 'Budget & Draft', color: 'amber', icon: 'savings' },
    experimental: { label: 'Experimental', color: 'rose', icon: 'science' },
};

/**
 * Merge default registry with custom providers stored in DB
 * Custom providers are stored in SystemSettings under 'video_provider_custom'
 */
async function getMergedProviderRegistry() {
    const customProviders = await getSetting('video_provider_custom', {});
    const merged = {};

    // Start with defaults
    for (const [modelId, config] of Object.entries(VIDEO_PROVIDER_REGISTRY)) {
        merged[modelId] = {
            ...config,
            providers: [...config.providers],
        };
    }

    // Merge in custom entries
    for (const [modelId, customData] of Object.entries(customProviders)) {
        if (!merged[modelId]) {
            // Entirely new model added by admin
            merged[modelId] = {
                name: customData.name || modelId,
                icon: customData.icon || 'movie',
                category: customData.category || 'experimental',
                defaultProvider: customData.defaultProvider || customData.providers?.[0]?.id,
                providers: [],
            };
        }
        // Merge custom providers into the model
        if (customData.providers) {
            for (const cp of customData.providers) {
                const existing = merged[modelId].providers.findIndex(p => p.id === cp.id);
                if (existing >= 0) {
                    // Update existing (custom overrides built-in fields like cost/description)
                    merged[modelId].providers[existing] = { ...merged[modelId].providers[existing], ...cp };
                } else {
                    // Add new provider
                    merged[modelId].providers.push({ ...cp, builtIn: false });
                }
            }
        }
        // Remove providers marked for deletion
        if (customData.removedProviders) {
            merged[modelId].providers = merged[modelId].providers.filter(
                p => !customData.removedProviders.includes(p.id)
            );
        }
        // Override default provider if set
        if (customData.defaultProvider) {
            merged[modelId].defaultProvider = customData.defaultProvider;
        }
    }

    return merged;
}

// GET /superadmin/video-providers — list ALL models with their providers + active selection
router.get('/video-providers', async (req, res) => {
    try {
        const registry = await getMergedProviderRegistry();
        const providerRoutes = await getSetting('video_provider_routes', {});
        const storedKeys = await getSetting('api_keys', {});

        const models = Object.entries(registry).map(([modelId, config]) => {
            const activeProvider = providerRoutes[modelId]?.active || config.defaultProvider;
            const lastSwitched = providerRoutes[modelId]?.updatedAt || null;

            const providers = config.providers.map(p => {
                const dbKey = storedKeys[p.id]?.apiKey;
                const envKey = process.env[p.envKey || ''];
                return {
                    id: p.id,
                    name: p.name,
                    envKey: p.envKey || '',
                    costPerSecond: p.costPerSecond || 0,
                    description: p.description || '',
                    hasKey: !!(dbKey || envKey),
                    keySource: dbKey ? 'database' : envKey ? 'env' : 'none',
                    isActive: p.id === activeProvider,
                    builtIn: p.builtIn !== false,
                };
            });

            return {
                id: modelId,
                name: config.name,
                icon: config.icon || 'movie',
                category: config.category || 'experimental',
                activeProvider,
                lastSwitched,
                providers,
                multiProvider: providers.length > 1,
            };
        });

        res.json({ success: true, models, categories: CATEGORY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/video-providers — switch active provider for a model
router.put('/video-providers', async (req, res) => {
    try {
        const { modelId, provider } = req.body;
        if (!modelId || !provider) return res.status(400).json({ success: false, error: 'modelId and provider required' });

        const registry = await getMergedProviderRegistry();
        const modelConfig = registry[modelId];
        if (!modelConfig) return res.status(400).json({ success: false, error: `Unknown model: ${modelId}` });

        const validProvider = modelConfig.providers.find(p => p.id === provider);
        if (!validProvider) return res.status(400).json({ success: false, error: `Unknown provider '${provider}' for '${modelId}'. Available: ${modelConfig.providers.map(p => p.id).join(', ')}` });

        // Verify API key exists
        const storedKeys = await getSetting('api_keys', {});
        const hasKey = !!(storedKeys[provider]?.apiKey || process.env[validProvider.envKey || '']);
        if (!hasKey) return res.status(400).json({ success: false, error: `No API key configured for ${validProvider.name}. Add it in API Key Management first.` });

        // Update the routes
        const providerRoutes = await getSetting('video_provider_routes', {});
        providerRoutes[modelId] = { active: provider, updatedAt: new Date(), updatedBy: req.user._id };
        await setSetting('video_provider_routes', providerRoutes, req.user._id);

        await logAudit(req, {
            action: 'SWITCH_VIDEO_PROVIDER',
            targetModel: 'SystemSettings',
            targetId: modelId,
            severity: 'high',
            metadata: { modelId, provider, providerName: validProvider.name },
        });

        console.log(`🔀 [SuperAdmin] Video provider switched: ${modelId} → ${validProvider.name} (${provider}) by ${req.user.email}`);
        res.json({ success: true, message: `${modelConfig.name} now using ${validProvider.name}`, modelId, provider });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/video-providers/provider — add a new provider to a model
router.post('/video-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId, providerName, envKey, costPerSecond, description } = req.body;
        if (!modelId || !providerId || !providerName) {
            return res.status(400).json({ success: false, error: 'modelId, providerId, and providerName are required' });
        }

        // Validate providerId format (alphanumeric + hyphens only)
        if (!/^[a-z0-9-]+$/.test(providerId)) {
            return res.status(400).json({ success: false, error: 'providerId must be lowercase alphanumeric with hyphens (e.g., "my-provider")' });
        }

        // Check for conflicts with built-in providers
        const registry = await getMergedProviderRegistry();
        const modelConfig = registry[modelId];
        if (modelConfig) {
            const existing = modelConfig.providers.find(p => p.id === providerId);
            if (existing?.builtIn) {
                return res.status(400).json({ success: false, error: `Cannot add provider '${providerId}' — conflicts with built-in provider. Use PATCH to modify it.` });
            }
        }

        // Store in custom providers
        const customProviders = await getSetting('video_provider_custom', {});
        if (!customProviders[modelId]) {
            customProviders[modelId] = { providers: [] };
        }
        if (!customProviders[modelId].providers) {
            customProviders[modelId].providers = [];
        }

        // Remove from removed list if it was previously removed
        if (customProviders[modelId].removedProviders) {
            customProviders[modelId].removedProviders = customProviders[modelId].removedProviders.filter(id => id !== providerId);
        }

        // Remove existing entry with same ID and add new
        customProviders[modelId].providers = customProviders[modelId].providers.filter(p => p.id !== providerId);
        customProviders[modelId].providers.push({
            id: providerId,
            name: providerName,
            envKey: envKey || `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`,
            costPerSecond: parseFloat(costPerSecond) || 0,
            description: description || `Custom provider: ${providerName}`,
            builtIn: false,
            addedAt: new Date(),
            addedBy: req.user._id,
        });

        await setSetting('video_provider_custom', customProviders, req.user._id);

        await logAudit(req, {
            action: 'ADD_VIDEO_PROVIDER',
            targetModel: 'SystemSettings',
            targetId: `${modelId}/${providerId}`,
            severity: 'medium',
            metadata: { modelId, providerId, providerName },
        });

        console.log(`➕ [SuperAdmin] Provider added: ${providerName} (${providerId}) → ${modelId} by ${req.user.email}`);
        res.json({ success: true, message: `${providerName} added to ${modelConfig?.name || modelId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PATCH /superadmin/video-providers/provider — modify an existing provider's details
router.patch('/video-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId, updates } = req.body;
        if (!modelId || !providerId || !updates) {
            return res.status(400).json({ success: false, error: 'modelId, providerId, and updates required' });
        }

        const allowedFields = ['name', 'envKey', 'costPerSecond', 'description'];
        const filtered = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) filtered[key] = updates[key];
        }
        if (Object.keys(filtered).length === 0) {
            return res.status(400).json({ success: false, error: `No valid fields to update. Allowed: ${allowedFields.join(', ')}` });
        }

        const customProviders = await getSetting('video_provider_custom', {});
        if (!customProviders[modelId]) customProviders[modelId] = { providers: [] };
        if (!customProviders[modelId].providers) customProviders[modelId].providers = [];

        // Find existing custom entry or create override for built-in
        const idx = customProviders[modelId].providers.findIndex(p => p.id === providerId);
        if (idx >= 0) {
            customProviders[modelId].providers[idx] = { ...customProviders[modelId].providers[idx], ...filtered };
        } else {
            // Create an override entry (will merge with built-in on read)
            customProviders[modelId].providers.push({ id: providerId, ...filtered });
        }

        await setSetting('video_provider_custom', customProviders, req.user._id);

        await logAudit(req, {
            action: 'MODIFY_VIDEO_PROVIDER',
            targetModel: 'SystemSettings',
            targetId: `${modelId}/${providerId}`,
            severity: 'medium',
            metadata: { modelId, providerId, updates: filtered },
        });

        res.json({ success: true, message: `Provider ${providerId} updated for ${modelId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /superadmin/video-providers/provider — remove a provider from a model
router.delete('/video-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId } = req.body;
        if (!modelId || !providerId) {
            return res.status(400).json({ success: false, error: 'modelId and providerId required' });
        }

        // Check if it's the currently active provider
        const providerRoutes = await getSetting('video_provider_routes', {});
        if (providerRoutes[modelId]?.active === providerId) {
            return res.status(400).json({ success: false, error: 'Cannot remove the currently active provider. Switch to another provider first.' });
        }

        const customProviders = await getSetting('video_provider_custom', {});
        if (!customProviders[modelId]) customProviders[modelId] = {};

        // Check if built-in — can only "hide" it, not truly delete
        const builtIn = VIDEO_PROVIDER_REGISTRY[modelId]?.providers?.find(p => p.id === providerId);
        if (builtIn) {
            // Mark as removed (hides it from UI, won't be routed)
            if (!customProviders[modelId].removedProviders) customProviders[modelId].removedProviders = [];
            if (!customProviders[modelId].removedProviders.includes(providerId)) {
                customProviders[modelId].removedProviders.push(providerId);
            }
        } else {
            // Custom provider — truly remove
            if (customProviders[modelId].providers) {
                customProviders[modelId].providers = customProviders[modelId].providers.filter(p => p.id !== providerId);
            }
        }

        await setSetting('video_provider_custom', customProviders, req.user._id);

        await logAudit(req, {
            action: 'REMOVE_VIDEO_PROVIDER',
            targetModel: 'SystemSettings',
            targetId: `${modelId}/${providerId}`,
            severity: 'high',
            metadata: { modelId, providerId, wasBuiltIn: !!builtIn },
        });

        console.log(`➖ [SuperAdmin] Provider removed: ${providerId} from ${modelId} by ${req.user.email}`);
        res.json({ success: true, message: `Provider ${providerId} removed${builtIn ? ' (hidden — can be re-added)' : ''}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});
// ══════════════════════════════════════════════════════════════
// IMAGE PROVIDER MANAGEMENT — Global API Switcher for Image Models
// Manage ALL image model providers: add, remove, switch, modify
// ══════════════════════════════════════════════════════════════

const IMAGE_PROVIDER_REGISTRY = {
    'nanobanana-2': {
        name: 'NanoBanana 2',
        icon: 'auto_awesome',
        category: 'multimodal',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Gemini Flash)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.003, description: 'Primary — Gemini 3.1 Flash image preview, cheapest, supports ref images', builtIn: true },
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerImage: 0.04, description: 'Fallback — supports custom pixel sizes', builtIn: true },
        ],
    },
    'nanobanana-pro': {
        name: 'NanoBanana Pro',
        icon: 'workspace_premium',
        category: 'multimodal',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Gemini Pro)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.007, description: 'Primary — Gemini 3 Pro image preview, higher quality, supports ref images', builtIn: true },
            { id: 'fal', name: 'fal.ai', envKey: 'FAL_API_KEY', costPerImage: 0.06, description: 'Fallback — queue-based async', builtIn: true },
        ],
    },
    'flux-pro-v1.1': {
        name: 'Flux Pro v1.1',
        icon: 'flash_on',
        category: 'text-to-image',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Flux Kontext Pro)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.02, description: 'Primary — Flux Kontext Pro via LZ, 50% cheaper', builtIn: true },
            { id: 'fal', name: 'fal.ai (Direct)', envKey: 'FAL_API_KEY', costPerImage: 0.04, description: 'Direct — exact pixel sizes, queue-based', builtIn: true },
        ],
    },
    'flux-2-pro': {
        name: 'Flux 2 Pro',
        icon: 'bolt',
        category: 'premium',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Flux Kontext Max)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.04, description: 'Primary — Flux Kontext Max via LZ', builtIn: true },
            { id: 'fal', name: 'fal.ai (Direct)', envKey: 'FAL_API_KEY', costPerImage: 0.08, description: 'Direct — highest quality, exact pixel sizes', builtIn: true },
        ],
    },
    'seedream-5': {
        name: 'Seedream 5',
        icon: 'landscape',
        category: 'text-to-image',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Flux Kontext Max)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.04, description: 'Rerouted — Seedream not on this LZ account, uses Flux Max', builtIn: true },
            { id: 'fal', name: 'fal.ai (Direct)', envKey: 'FAL_API_KEY', costPerImage: 0.05, description: 'Direct Seedream — native ByteDance model', builtIn: true },
        ],
    },
    'ideogram': {
        name: 'Ideogram v3',
        icon: 'draw',
        category: 'text-to-image',
        defaultProvider: 'laozhang',
        providers: [
            { id: 'laozhang', name: 'LaoZhang (Flux Kontext Pro)', envKey: 'LAOZHANG_API_KEY', costPerImage: 0.02, description: 'Cheapest — routes through Flux Kontext Pro on LZ', builtIn: true },
            { id: 'fal', name: 'fal.ai (Direct Ideogram)', envKey: 'FAL_API_KEY', costPerImage: 0.06, description: 'Native Ideogram v3 — true Ideogram quality, supports custom sizes', builtIn: true },
        ],
    },
    'grok-imagen': {
        name: 'Grok Imagen',
        icon: 'auto_fix_high',
        category: 'premium',
        defaultProvider: 'grok',
        providers: [
            { id: 'grok', name: 'xAI (Native)', envKey: 'GROK_API_KEY', costPerImage: 0.05, description: 'Native xAI Grok Imagen API — fast, single provider', builtIn: true },
        ],
    },
};

const IMAGE_CATEGORY_LABELS = {
    multimodal: { label: 'Multimodal (Ref Images)', color: 'cyan', icon: 'auto_awesome' },
    'text-to-image': { label: 'Text-to-Image', color: 'violet', icon: 'image' },
    premium: { label: 'Premium', color: 'amber', icon: 'workspace_premium' },
};

async function getMergedImageProviderRegistry() {
    const customProviders = await getSetting('image_provider_custom', {});
    const merged = {};

    for (const [modelId, config] of Object.entries(IMAGE_PROVIDER_REGISTRY)) {
        merged[modelId] = { ...config, providers: [...config.providers] };
    }

    for (const [modelId, customData] of Object.entries(customProviders)) {
        if (!merged[modelId]) {
            merged[modelId] = {
                name: customData.name || modelId,
                icon: customData.icon || 'image',
                category: customData.category || 'text-to-image',
                defaultProvider: customData.defaultProvider || customData.providers?.[0]?.id,
                providers: [],
            };
        }
        if (customData.providers) {
            for (const cp of customData.providers) {
                const existing = merged[modelId].providers.findIndex(p => p.id === cp.id);
                if (existing >= 0) {
                    merged[modelId].providers[existing] = { ...merged[modelId].providers[existing], ...cp };
                } else {
                    merged[modelId].providers.push({ ...cp, builtIn: false });
                }
            }
        }
        if (customData.removedProviders) {
            merged[modelId].providers = merged[modelId].providers.filter(p => !customData.removedProviders.includes(p.id));
        }
        if (customData.defaultProvider) {
            merged[modelId].defaultProvider = customData.defaultProvider;
        }
    }

    return merged;
}

// GET /superadmin/image-providers
router.get('/image-providers', async (req, res) => {
    try {
        const registry = await getMergedImageProviderRegistry();
        const providerRoutes = await getSetting('image_provider_routes', {});
        const storedKeys = await getSetting('api_keys', {});

        const models = Object.entries(registry).map(([modelId, config]) => {
            const activeProvider = providerRoutes[modelId]?.active || config.defaultProvider;
            const lastSwitched = providerRoutes[modelId]?.updatedAt || null;

            const providers = config.providers.map(p => {
                const dbKey = storedKeys[p.id]?.apiKey;
                const envKey = process.env[p.envKey || ''];
                return {
                    id: p.id, name: p.name, envKey: p.envKey || '',
                    costPerImage: p.costPerImage || 0, description: p.description || '',
                    hasKey: !!(dbKey || envKey), keySource: dbKey ? 'database' : envKey ? 'env' : 'none',
                    isActive: p.id === activeProvider, builtIn: p.builtIn !== false,
                };
            });

            return {
                id: modelId, name: config.name, icon: config.icon || 'image',
                category: config.category || 'text-to-image', activeProvider, lastSwitched,
                providers, multiProvider: providers.length > 1,
            };
        });

        res.json({ success: true, models, categories: IMAGE_CATEGORY_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/image-providers — switch active provider
router.put('/image-providers', async (req, res) => {
    try {
        const { modelId, provider } = req.body;
        if (!modelId || !provider) return res.status(400).json({ success: false, error: 'modelId and provider required' });

        const registry = await getMergedImageProviderRegistry();
        const modelConfig = registry[modelId];
        if (!modelConfig) return res.status(400).json({ success: false, error: `Unknown model: ${modelId}` });

        const validProvider = modelConfig.providers.find(p => p.id === provider);
        if (!validProvider) return res.status(400).json({ success: false, error: `Unknown provider '${provider}' for '${modelId}'` });

        const storedKeys = await getSetting('api_keys', {});
        const hasKey = !!(storedKeys[provider]?.apiKey || process.env[validProvider.envKey || '']);
        if (!hasKey) return res.status(400).json({ success: false, error: `No API key for ${validProvider.name}. Add it in API Key Management first.` });

        const providerRoutes = await getSetting('image_provider_routes', {});
        providerRoutes[modelId] = { active: provider, updatedAt: new Date(), updatedBy: req.user._id };
        await setSetting('image_provider_routes', providerRoutes, req.user._id);

        await logAudit(req, { action: 'SWITCH_IMAGE_PROVIDER', targetModel: 'SystemSettings', targetId: modelId, severity: 'high', metadata: { modelId, provider, providerName: validProvider.name } });

        console.log(`🔀 [SuperAdmin] Image provider switched: ${modelId} → ${validProvider.name} (${provider}) by ${req.user.email}`);
        res.json({ success: true, message: `${modelConfig.name} now using ${validProvider.name}`, modelId, provider });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/image-providers/provider — add new provider
router.post('/image-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId, providerName, envKey, costPerImage, description } = req.body;
        if (!modelId || !providerId || !providerName) return res.status(400).json({ success: false, error: 'modelId, providerId, and providerName required' });
        if (!/^[a-z0-9-]+$/.test(providerId)) return res.status(400).json({ success: false, error: 'providerId must be lowercase alphanumeric with hyphens' });

        const registry = await getMergedImageProviderRegistry();
        const modelConfig = registry[modelId];
        if (modelConfig) {
            const existing = modelConfig.providers.find(p => p.id === providerId);
            if (existing?.builtIn) return res.status(400).json({ success: false, error: `Cannot add '${providerId}' — conflicts with built-in. Use PATCH to modify.` });
        }

        const customProviders = await getSetting('image_provider_custom', {});
        if (!customProviders[modelId]) customProviders[modelId] = { providers: [] };
        if (!customProviders[modelId].providers) customProviders[modelId].providers = [];
        if (customProviders[modelId].removedProviders) {
            customProviders[modelId].removedProviders = customProviders[modelId].removedProviders.filter(id => id !== providerId);
        }

        customProviders[modelId].providers = customProviders[modelId].providers.filter(p => p.id !== providerId);
        customProviders[modelId].providers.push({
            id: providerId, name: providerName,
            envKey: envKey || `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`,
            costPerImage: parseFloat(costPerImage) || 0,
            description: description || `Custom provider: ${providerName}`,
            builtIn: false, addedAt: new Date(), addedBy: req.user._id,
        });

        await setSetting('image_provider_custom', customProviders, req.user._id);
        await logAudit(req, { action: 'ADD_IMAGE_PROVIDER', targetModel: 'SystemSettings', targetId: `${modelId}/${providerId}`, severity: 'medium', metadata: { modelId, providerId, providerName } });

        console.log(`➕ [SuperAdmin] Image provider added: ${providerName} (${providerId}) → ${modelId} by ${req.user.email}`);
        res.json({ success: true, message: `${providerName} added to ${modelConfig?.name || modelId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PATCH /superadmin/image-providers/provider — modify provider
router.patch('/image-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId, updates } = req.body;
        if (!modelId || !providerId || !updates) return res.status(400).json({ success: false, error: 'modelId, providerId, and updates required' });

        const allowedFields = ['name', 'envKey', 'costPerImage', 'description'];
        const filtered = {};
        for (const key of allowedFields) { if (updates[key] !== undefined) filtered[key] = updates[key]; }
        if (Object.keys(filtered).length === 0) return res.status(400).json({ success: false, error: `No valid fields. Allowed: ${allowedFields.join(', ')}` });

        const customProviders = await getSetting('image_provider_custom', {});
        if (!customProviders[modelId]) customProviders[modelId] = { providers: [] };
        if (!customProviders[modelId].providers) customProviders[modelId].providers = [];

        const idx = customProviders[modelId].providers.findIndex(p => p.id === providerId);
        if (idx >= 0) {
            customProviders[modelId].providers[idx] = { ...customProviders[modelId].providers[idx], ...filtered };
        } else {
            customProviders[modelId].providers.push({ id: providerId, ...filtered });
        }

        await setSetting('image_provider_custom', customProviders, req.user._id);
        await logAudit(req, { action: 'MODIFY_IMAGE_PROVIDER', targetModel: 'SystemSettings', targetId: `${modelId}/${providerId}`, severity: 'medium', metadata: { modelId, providerId, updates: filtered } });

        res.json({ success: true, message: `Provider ${providerId} updated for ${modelId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /superadmin/image-providers/provider — remove provider
router.delete('/image-providers/provider', async (req, res) => {
    try {
        const { modelId, providerId } = req.body;
        if (!modelId || !providerId) return res.status(400).json({ success: false, error: 'modelId and providerId required' });

        const providerRoutes = await getSetting('image_provider_routes', {});
        if (providerRoutes[modelId]?.active === providerId) {
            return res.status(400).json({ success: false, error: 'Cannot remove active provider. Switch first.' });
        }

        const customProviders = await getSetting('image_provider_custom', {});
        if (!customProviders[modelId]) customProviders[modelId] = {};

        const builtIn = IMAGE_PROVIDER_REGISTRY[modelId]?.providers?.find(p => p.id === providerId);
        if (builtIn) {
            if (!customProviders[modelId].removedProviders) customProviders[modelId].removedProviders = [];
            if (!customProviders[modelId].removedProviders.includes(providerId)) {
                customProviders[modelId].removedProviders.push(providerId);
            }
        } else {
            if (customProviders[modelId].providers) {
                customProviders[modelId].providers = customProviders[modelId].providers.filter(p => p.id !== providerId);
            }
        }

        await setSetting('image_provider_custom', customProviders, req.user._id);
        await logAudit(req, { action: 'REMOVE_IMAGE_PROVIDER', targetModel: 'SystemSettings', targetId: `${modelId}/${providerId}`, severity: 'high', metadata: { modelId, providerId, wasBuiltIn: !!builtIn } });

        console.log(`➖ [SuperAdmin] Image provider removed: ${providerId} from ${modelId} by ${req.user.email}`);
        res.json({ success: true, message: `Provider ${providerId} removed${builtIn ? ' (hidden — can be re-added)' : ''}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// WATERMARK MANAGEMENT
// ══════════════════════════════════════════════════════════════

// POST /superadmin/watermark/upload — upload logo image for watermark
router.post('/watermark/upload', async (req, res) => {
    try {
        const { image } = req.body; // base64 data URL
        if (!image) return res.status(400).json({ success: false, error: 'Image data required' });

        // Extract base64
        const commaIdx = image.indexOf(',');
        const base64Data = commaIdx > -1 ? image.substring(commaIdx + 1) : image;
        const mimeMatch = image.match(/data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';

        const buffer = Buffer.from(base64Data, 'base64');
        const s3Key = `system/watermark-logo-${Date.now()}.${ext}`;
        const url = await uploadToS3(buffer, s3Key, mimeType);

        await setSetting('watermark_logo_url', url, req.user._id);
        await logAudit(req, { action: 'UPDATE_WATERMARK_LOGO', targetModel: 'SystemSettings', targetId: 'watermark_logo', severity: 'warning', metadata: { url } });

        res.json({ success: true, url, message: 'Watermark logo uploaded' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/watermark/settings — update watermark position, opacity
router.put('/watermark/settings', async (req, res) => {
    try {
        const { position, opacity, enabled } = req.body;
        if (position) await setSetting('watermark_position', position, req.user._id);
        if (opacity !== undefined) await setSetting('watermark_opacity', Math.max(0.1, Math.min(1, parseFloat(opacity))), req.user._id);
        if (enabled !== undefined) await setSetting('watermark_enabled', !!enabled, req.user._id);

        await logAudit(req, { action: 'UPDATE_WATERMARK_SETTINGS', targetModel: 'SystemSettings', targetId: 'watermark', severity: 'low', metadata: { position, opacity, enabled } });
        res.json({ success: true, message: 'Watermark settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/watermark/override — set per-brand or per-user watermark override
router.put('/watermark/override', async (req, res) => {
    try {
        const { targetType, targetId, enabled, logoUrl } = req.body; // targetType: 'brand' | 'user'
        if (!['brand', 'user'].includes(targetType) || !targetId) return res.status(400).json({ success: false, error: 'targetType (brand/user) and targetId required' });

        const overrides = await getSetting('watermark_overrides', {});
        const key = `${targetType}_${targetId}`;

        if (enabled === undefined && !logoUrl) {
            // Remove override
            delete overrides[key];
        } else {
            overrides[key] = { targetType, targetId, enabled: enabled !== undefined ? !!enabled : true, logoUrl: logoUrl || null, updatedAt: new Date() };
        }

        await setSetting('watermark_overrides', overrides, req.user._id);
        await logAudit(req, { action: 'UPDATE_WATERMARK_OVERRIDE', targetModel: targetType === 'brand' ? 'Brand' : 'User', targetId, severity: 'low', metadata: { enabled, logoUrl } });
        res.json({ success: true, message: `Watermark override ${enabled === undefined && !logoUrl ? 'removed' : 'set'} for ${targetType} ${targetId}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /superadmin/watermark/overrides — list all overrides
router.get('/watermark/overrides', async (req, res) => {
    try {
        const overrides = await getSetting('watermark_overrides', {});
        // Enrich with names
        const entries = await Promise.all(Object.entries(overrides).map(async ([key, val]) => {
            let name = key;
            if (val.targetType === 'brand') {
                const brand = await Brand.findById(val.targetId).select('name').lean();
                name = brand?.name || val.targetId;
            } else if (val.targetType === 'user') {
                const user = await User.findById(val.targetId).select('name email').lean();
                name = user?.name || user?.email || val.targetId;
            }
            return { ...val, key, name };
        }));
        res.json({ success: true, overrides: entries });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// PROVIDER USAGE INTELLIGENCE
// ══════════════════════════════════════════════════════════════

// GET /superadmin/provider-usage — real API usage from providers + internal logs
router.get('/provider-usage', async (req, res) => {
    try {
        const storedKeys = await getSetting('api_keys', {});
        const days = parseInt(req.query.days) || 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Aggregate internal usage from CreditUsage
        const internalUsage = await CreditUsage.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: {
                _id: '$tokenUsage.model',
                calls: { $sum: 1 },
                totalTokens: { $sum: '$tokenUsage.totalTokens' },
                inputTokens: { $sum: '$tokenUsage.inputTokens' },
                outputTokens: { $sum: '$tokenUsage.outputTokens' },
                estimatedCost: { $sum: '$tokenUsage.estimatedCost' },
                totalCredits: { $sum: '$cost' },
            }},
            { $sort: { estimatedCost: -1 } },
        ]).allowDiskUse(true);

        // Map models to providers
        const providerModels = {
            openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
            anthropic: ['Claude Opus 4.6', 'claude-3-opus', 'claude-3-5-sonnet', 'claude-3-haiku'],
            gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-image'],
            grok: ['grok-3', 'grok-3-mini', 'grok-beta'],
            piapi: ['seedance-2.0', 'kling-v2'],
            fal: ['kling-fal', 'fast-sdxl'],
            sarvam: ['bulbul', 'saaras', 'sarvam-2b'],
        };

        const providerUsage = {};
        for (const [prov, models] of Object.entries(providerModels)) {
            const usage = internalUsage.filter(u => models.some(m => (u._id || '').toLowerCase().includes(m.toLowerCase())));
            providerUsage[prov] = {
                calls: usage.reduce((s, u) => s + u.calls, 0),
                totalTokens: usage.reduce((s, u) => s + (u.totalTokens || 0), 0),
                estimatedCostUSD: Math.round(usage.reduce((s, u) => s + (u.estimatedCost || 0), 0) * 100) / 100,
                creditsUsed: usage.reduce((s, u) => s + u.totalCredits, 0),
                models: usage.map(u => ({ model: u._id || 'unknown', calls: u.calls, tokens: u.totalTokens || 0, cost: Math.round((u.estimatedCost || 0) * 100) / 100 })),
            };
        }

        // Try to fetch real usage from OpenAI (if key available)
        let openaiRealUsage = null;
        const openaiKey = storedKeys.openai?.apiKey || process.env.OPENAI_API_KEY;
        if (openaiKey) {
            try {
                const startDate = since.toISOString().split('T')[0];
                const endDate = new Date().toISOString().split('T')[0];
                const oResp = await fetch(`https://api.openai.com/v1/organization/usage/completions?start_time=${Math.floor(since.getTime() / 1000)}&limit=1&group_by=model`, {
                    headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' }
                });
                if (oResp.ok) openaiRealUsage = await oResp.json();
            } catch (e) { /* OpenAI usage API may not be available */ }
        }

        // Try PiAPI account balance
        let piapiBalance = null;
        const piapiKey = storedKeys.piapi?.apiKey || process.env.PIAPI_API_KEY;
        if (piapiKey) {
            try {
                const pResp = await fetch('https://api.piapi.ai/api/v1/account', { headers: { 'Authorization': `Bearer ${piapiKey}` } });
                if (pResp.ok) piapiBalance = await pResp.json();
            } catch (e) { /* ignore */ }
        }

        // Try fal.ai account balance
        let falBalance = null;
        const falKey = storedKeys.fal?.apiKey || process.env.FAL_API_KEY;
        if (falKey) {
            try {
                const fResp = await fetch('https://rest.alpha.fal.ai/billing', {
                    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(10000),
                });
                if (fResp.ok) {
                    falBalance = await fResp.json();
                } else {
                    // Try alternate endpoint
                    try {
                        const fResp2 = await fetch('https://queue.fal.run/fal-ai/fast-sdxl', {
                            method: 'POST',
                            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: 'test', num_images: 0 }),
                            signal: AbortSignal.timeout(5000),
                        });
                        // If 402/403 = balance issue, 200 = working
                        falBalance = { status: fResp2.status === 200 || fResp2.status === 422 ? 'active' : fResp2.status === 402 || fResp2.status === 403 ? 'exhausted' : 'unknown', httpStatus: fResp2.status };
                    } catch (e2) { falBalance = { status: 'unreachable' }; }
                }
            } catch (e) { falBalance = { status: 'unreachable', error: e.message }; }
        }

        // Try LaoZhang balance
        let laozhangBalance = null;
        const lzKey = storedKeys.laozhang?.apiKey || process.env.LAOZHANG_API_KEY;
        if (lzKey) {
            try {
                const lzResp = await fetch('https://api.laozhang.ai/v1/models', {
                    headers: { 'Authorization': `Bearer ${lzKey}` },
                    signal: AbortSignal.timeout(10000),
                });
                laozhangBalance = { status: lzResp.ok ? 'active' : 'error', httpStatus: lzResp.status, modelsAvailable: lzResp.ok ? (await lzResp.json()).data?.length || 0 : 0 };
            } catch (e) { laozhangBalance = { status: 'unreachable', error: e.message }; }
        }

        // Daily trend (last N days)
        const dailyTrend = await CreditUsage.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, calls: { $sum: 1 }, credits: { $sum: '$cost' }, cost: { $sum: '$tokenUsage.estimatedCost' } } },
            { $sort: { _id: 1 } },
        ]);

        res.json({
            success: true,
            days,
            providerUsage,
            openaiRealUsage,
            piapiBalance,
            falBalance,
            laozhangBalance,
            dailyTrend,
            totalEstimatedCostUSD: Math.round(Object.values(providerUsage).reduce((s, p) => s + p.estimatedCostUSD, 0) * 100) / 100,
            totalCalls: Object.values(providerUsage).reduce((s, p) => s + p.calls, 0),
            totalCreditsUsed: Object.values(providerUsage).reduce((s, p) => s + p.creditsUsed, 0),
        });
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

// ══════════════════════════════════════════════════════════════
// 9. PLATFORM PROVIDER BUDGETS
// ══════════════════════════════════════════════════════════════

// GET /superadmin/provider-budgets — current consumption vs limits
router.get('/provider-budgets', async (req, res) => {
    try {
        const budgets = await getSetting('provider_budgets', {});
        res.json({ success: true, budgets });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/provider-budgets — update limit or reset consumption
router.put('/provider-budgets', async (req, res) => {
    try {
        const { provider, budget, consumed, reset } = req.body;
        if (!provider) return res.status(400).json({ success: false, error: 'Provider name required' });
        
        const budgets = await getSetting('provider_budgets', {});
        const p = provider.toLowerCase();
        
        if (!budgets[p]) {
            budgets[p] = { budget: 1000, consumed: 0, lastUpdate: new Date() };
        }

        if (budget !== undefined) budgets[p].budget = budget;
        if (consumed !== undefined) budgets[p].consumed = consumed;
        if (reset) {
            budgets[p].consumed = 0;
            budgets[p].lastReset = new Date();
        }
        
        budgets[p].lastUpdate = new Date();
        await setSetting('provider_budgets', budgets, req.user._id);

        await logAudit(req, {
            action: 'UPDATE_PROVIDER_BUDGET',
            targetModel: 'SystemSettings',
            targetId: p,
            severity: 'warning',
            metadata: { provider: p, budget, reset }
        });

        res.json({ success: true, message: `Budget for ${provider} updated`, budgets });
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
// 8.5 CREDIT PACK MANAGEMENT (Super Admin)
// ══════════════════════════════════════════════════════════════

import CreditPack from '../models/CreditPack.js';

// GET /superadmin/credit-packs — List all credit packs
router.get('/credit-packs', async (req, res) => {
    try {
        const packs = await CreditPack.find()
            .sort({ displayOrder: 1 })
            .populate('createdBy', 'name email')
            .lean();
        res.json({ success: true, packs });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/credit-packs — Create a credit pack
router.post('/credit-packs', async (req, res) => {
    try {
        const pack = await CreditPack.create({
            ...req.body,
            createdBy: req.user._id,
        });

        await logAudit(req, {
            action: 'CREATE_CREDIT_PACK',
            targetModel: 'CreditPack',
            targetId: pack._id,
            changes: { after: pack.toJSON() },
        });

        res.status(201).json({ success: true, pack });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /superadmin/credit-packs/:id — Update a credit pack
router.put('/credit-packs/:id', async (req, res) => {
    try {
        const previous = await CreditPack.findById(req.params.id);
        if (!previous) return res.status(404).json({ success: false, error: 'Pack not found' });

        const pack = await CreditPack.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });

        await logAudit(req, {
            action: 'UPDATE_CREDIT_PACK',
            targetModel: 'CreditPack',
            targetId: pack._id,
            changes: { before: previous.toJSON(), after: pack.toJSON() },
        });

        res.json({ success: true, pack });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /superadmin/credit-packs/:id — Delete a credit pack
router.delete('/credit-packs/:id', async (req, res) => {
    try {
        const pack = await CreditPack.findById(req.params.id);
        if (!pack) return res.status(404).json({ success: false, error: 'Pack not found' });

        await CreditPack.findByIdAndDelete(req.params.id);

        await logAudit(req, {
            action: 'DELETE_CREDIT_PACK',
            targetModel: 'CreditPack',
            targetId: pack._id,
            severity: 'warning',
            metadata: { name: pack.name, slug: pack.slug },
        });

        res.json({ success: true, message: 'Credit pack deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/credit-packs/:id/toggle — Enable/disable a pack
router.post('/credit-packs/:id/toggle', async (req, res) => {
    try {
        const pack = await CreditPack.findById(req.params.id);
        if (!pack) return res.status(404).json({ success: false, error: 'Pack not found' });

        pack.isActive = !pack.isActive;
        await pack.save();

        await logAudit(req, {
            action: pack.isActive ? 'ENABLE_CREDIT_PACK' : 'DISABLE_CREDIT_PACK',
            targetModel: 'CreditPack',
            targetId: pack._id,
            metadata: { name: pack.name },
        });

        res.json({ success: true, pack, message: `Pack ${pack.isActive ? 'enabled' : 'disabled'}` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/credit-packs/seed-defaults — Seed 8 default packs
router.post('/credit-packs/seed-defaults', async (req, res) => {
    try {
        const existing = await CreditPack.countDocuments();
        if (existing > 0 && !req.body.force) {
            return res.json({ success: false, error: 'Credit packs already exist. Send force: true to reset.' });
        }
        if (req.body.force) await CreditPack.deleteMany({});

        const defaults = [
            {
                name: '🔹 Micro', slug: 'micro',
                credits: 20, bonusCredits: 0, price: 149,
                icon: 'token', badge: '', displayOrder: 1,
                validityDays: 180, description: 'Try it out',
                createdBy: req.user._id,
            },
            {
                name: '⚡ Spark', slug: 'spark',
                credits: 50, bonusCredits: 0, price: 349,
                icon: 'bolt', badge: '', displayOrder: 2,
                validityDays: 180, description: 'Quick power-up',
                createdBy: req.user._id,
            },
            {
                name: '🚀 Boost', slug: 'boost',
                credits: 150, bonusCredits: 15, price: 899,
                icon: 'rocket_launch', badge: '', displayOrder: 3,
                validityDays: 180, description: '+15 bonus credits',
                createdBy: req.user._id,
            },
            {
                name: '💪 Power', slug: 'power',
                credits: 300, bonusCredits: 45, price: 1699,
                icon: 'fitness_center', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 4,
                validityDays: 180, description: '+45 bonus credits',
                createdBy: req.user._id,
            },
            {
                name: '🔥 Ultra', slug: 'ultra',
                credits: 600, bonusCredits: 90, price: 3299,
                icon: 'whatshot', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 5,
                validityDays: 180, description: '+90 bonus credits',
                createdBy: req.user._id,
            },
            {
                name: '⭐ Pro', slug: 'pro',
                credits: 1500, bonusCredits: 300, price: 7999,
                icon: 'star', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 6,
                validityDays: 180, description: '+300 bonus credits',
                color: '#6366f1',
                createdBy: req.user._id,
            },
            {
                name: '💎 Mega', slug: 'mega',
                credits: 4000, bonusCredits: 1000, price: 22499,
                icon: 'diamond', badge: 'Flash Sale', badgeColor: '#ef4444', displayOrder: 7,
                validityDays: 180, description: '+1,000 bonus credits',
                color: '#8b5cf6',
                createdBy: req.user._id,
            },
            {
                name: '👑 Supreme', slug: 'supreme',
                credits: 10000, bonusCredits: 3500, price: 53999,
                icon: 'workspace_premium', badge: 'Best Value', badgeColor: '#f59e0b', displayOrder: 8,
                validityDays: 180, description: '+3,500 bonus credits',
                color: '#f59e0b',
                createdBy: req.user._id,
            },
        ];

        const created = await CreditPack.insertMany(defaults);

        await logAudit(req, {
            action: 'SEED_CREDIT_PACKS',
            targetModel: 'CreditPack',
            metadata: { count: created.length },
        });

        res.json({ success: true, packs: created, message: `${created.length} default credit packs created` });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════
// 8.7 PRICING STRATEGY COMMAND CENTER (Super Admin)
// ══════════════════════════════════════════════════════════════

import { PROVIDER_PRICING, checkPricingChanges, simulateImpact } from '../agents/pricingMonitor.js';
import { COST_PER_SECOND, MODEL_CAPABILITIES, estimateCost } from '../agents/videoStudio/falClient.js';

// GET /superadmin/pricing-policy — Full pricing policy document
router.get('/pricing-policy', async (req, res) => {
    try {
        const costs = await getCreditCosts();
        const creditPacks = await CreditPack.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
        const packages = await (await import('../models/SubscriptionPackage.js')).default
            .find({ isDeleted: { $ne: true } }).sort({ tier: 1 }).lean();

        // Group credit costs by studio
        const studioOf = (a) => {
            if (a.startsWith('seo')) return 'SEO Studio';
            if (a.startsWith('brainstorm') || a === 'trendRefresh') return 'Brainstorm Studio';
            if (a.startsWith('video')) return 'Video Studio';
            if (a.startsWith('social')) return 'Social Media Studio';
            if (a.startsWith('canvas')) return 'Creative Studio (Canvas)';
            if (['content', 'contentRefine'].includes(a)) return 'Content Studio';
            if (['creative', 'photoshoot'].includes(a)) return 'Creative Studio';
            if (a === 'adCreative') return 'Performance Marketing';
            if (a.startsWith('voice')) return 'Voice Studio';
            return 'Other';
        };

        const ACTION_LABELS = {
            content: 'Content Generate', contentRefine: 'Content Refine',
            creative: 'Creative Image', photoshoot: 'AI Photoshoot',
            seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic', seoCompetitors: 'SEO Competitors',
            seoAiVisibility: 'SEO AI Visibility', seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit',
            seoCompetitorDiscover: 'SEO Discover', seoBacklinks: 'SEO Backlinks', seoWarRoom: 'SEO War Room',
            seoLlmProbe: 'SEO LLM Probe', seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining',
            brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine', brainstormChat: 'Brainstorm Chat',
            brainstormScreenplay: 'Screenplay', trendRefresh: 'Trend Refresh',
            videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generate (dynamic)', videoEdit: 'Video Edit',
            socialMedia: 'Social Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Audit',
            socialMediaCompetitor: 'Social Competitor', socialMediaScore: 'Social Score',
            canvasGenerate: 'Canvas AI Gen', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend',
            adCreative: 'Ad Creative', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe',
        };

        const creditCostsByStudio = {};
        for (const [action, creditCost] of Object.entries(costs)) {
            const studio = studioOf(action);
            if (!creditCostsByStudio[studio]) creditCostsByStudio[studio] = [];
            creditCostsByStudio[studio].push({
                action,
                label: ACTION_LABELS[action] || action,
                credits: creditCost === 'dynamic' ? 'Dynamic (ceil(USD×34))' : creditCost,
            });
        }

        // Video model cost matrix
        const videoMatrix = Object.entries(COST_PER_SECOND || {}).map(([model, rates]) => {
            const caps = MODEL_CAPABILITIES?.[model] || {};
            return {
                model: 'Claude Opus 4.6',
                fastPerSec: rates.fast, qualityPerSec: rates.quality,
                // Cost examples at different durations
                examples: [5, 10, 15].map(dur => ({
                    duration: dur,
                    fast720: estimateCost(model, dur, '720p', 'fast'),
                    fast1080: estimateCost(model, dur, '1080p', 'fast'),
                })),
            };
        });

        res.json({
            success: true,
            policy: {
                formula: {
                    text: 'credits = max(ceil(USD_cost × 34), floor)',
                    floorPrice: '₹5/credit minimum',
                    targetMargin: '≥50% gross margin on all actions',
                    exchangeRate: 'USD/INR = 85 (configurable)',
                },
                creditCostsByStudio,
                videoMatrix,
                creditPacks: creditPacks.map(p => ({
                    name: p.name, slug: p.slug,
                    credits: p.credits, bonus: p.bonusCredits,
                    total: p.credits + (p.bonusCredits || 0),
                    price: p.price, perCredit: ((p.price) / (p.credits + (p.bonusCredits || 0))).toFixed(2),
                    validity: p.validityDays, badge: p.badge,
                })),
                subscriptionPlans: packages.map(p => ({
                    name: p.name, tier: p.tier,
                    monthlyCredits: p.credits?.monthly,
                    monthlyPrice: p.pricing?.monthly,
                })),
                guardrails: [
                    { rule: 'Minimum credit floor', value: '₹5/credit', reason: 'Ensures profitability on all actions' },
                    { rule: 'Video pricing formula', value: 'ceil(USD × 34)', reason: '≥50% margin at floor price' },
                    { rule: 'Minimum video credits', value: '5 credits', reason: 'Prevents sub-₹25 video generations' },
                    { rule: 'Top-up validity', value: '180 days (standard) / 31 days (promo)', reason: 'Encourages usage, deferred revenue recognition' },
                    { rule: 'First purchase bonus', value: '2× credits', reason: 'Acquisition incentive, one-time only' },
                ],
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /superadmin/pricing-monitor — Provider baselines + alerts + comparison
router.get('/pricing-monitor', async (req, res) => {
    try {
        const baselines = await getSetting('pricing_baselines', null);
        const lastCheck = await getSetting('pricing_last_check', null);
        const alerts = await getSetting('pricing_alerts', []);

        // Reconstruct live providers from flat baseline map, fallback to static if not yet scraped
        let liveProviders = JSON.parse(JSON.stringify(PROVIDER_PRICING));
        if (baselines) {
            for (const [key, modelData] of Object.entries(baselines)) {
                const parts = key.split('::');
                if (parts.length === 2 && liveProviders[parts[0]] && liveProviders[parts[0]].models[parts[1]]) {
                    liveProviders[parts[0]].models[parts[1]] = {
                        ...liveProviders[parts[0]].models[parts[1]],
                        ...modelData
                    };
                }
            }
        }

        // ── Build cross-provider comparison matrix ──
        // Groups models by canonical capability name, showing all providers that offer it
        const comparisonMap = {}; // { canonicalName: { type, providers: [{ providerId, providerName, icon, modelId, cost, costLabel, pricingUrl }] } }

        for (const [providerId, provider] of Object.entries(liveProviders)) {
            for (const [modelId, model] of Object.entries(provider.models)) {
                // Derive canonical name for grouping (strip "via LZ", provider suffixes, etc.)
                let canonical = model.name
                    .replace(/\s*\(via LZ\)\s*/gi, '')
                    .replace(/\s*\(via fal\.ai\)\s*/gi, '')
                    .replace(/\s*\(PiAPI\)\s*/gi, '')
                    .replace(/\s*\(ByteDance\)\s*/gi, '')
                    .replace(/\s*\(Tencent\)\s*/gi, '')
                    .trim();

                // Normalize known duplicates
                const normalizations = {
                    'Veo 3.1 Fast': 'Veo 3.1 Fast',
                    'Veo 3.1': 'Veo 3.1',
                    'Seedance 2.0 Pro': 'Seedance 2.0',
                    'Seedance 2.0': 'Seedance 2.0',
                    'Seedance 1.0 Lite': 'Seedance 1.0',
                    'Sora 2': 'Sora 2',
                    'Ideogram v3': 'Ideogram v3',
                    'Seedream 5': 'Seedream 5',
                    'NanoBanana 2': 'NanoBanana 2',
                    'NanoBanana Pro': 'NanoBanana Pro',
                    'Flux Kontext Pro': 'Flux Kontext Pro',
                };
                canonical = normalizations[canonical] || canonical;

                // Calculate a single comparable cost in USD cents
                let costUSD = null;
                let costLabel = '';
                if (model.type === 'text') {
                    costUSD = model.inputPer1M ?? null;
                    costLabel = `$${model.inputPer1M}/1M in · $${model.outputPer1M}/1M out`;
                } else if (model.type === 'image') {
                    costUSD = model.flatCostUSD ?? null;
                    costLabel = `$${model.flatCostUSD}/image`;
                } else if (model.type === 'video') {
                    costUSD = model.costPerSecFast ?? model.flatCostUSD ?? null;
                    if (model.costPerSecFast != null) {
                        costLabel = `$${model.costPerSecFast}/sec (fast)`;
                        if (model.costPerSecQuality) costLabel += ` · $${model.costPerSecQuality}/sec (quality)`;
                    } else if (model.flatCostUSD != null) {
                        costLabel = `$${model.flatCostUSD}/gen`;
                    }
                } else if (model.type === 'voice') {
                    costUSD = model.costPerMinute ?? model.costPerSecond ?? null;
                    costLabel = model.costPerMinute != null ? `$${model.costPerMinute}/min` : `$${model.costPerSecond}/sec`;
                }

                if (!comparisonMap[canonical]) {
                    comparisonMap[canonical] = { type: model.type, providers: [] };
                }

                comparisonMap[canonical].providers.push({
                    providerId,
                    providerName: provider.provider,
                    icon: provider.icon,
                    modelId,
                    costUSD: costUSD ?? 999,
                    costLabel,
                    pricingUrl: model.pricingUrl || '',
                    unit: model.unit || '',
                });
            }
        }

        // Sort providers by cost (cheapest first) and mark the cheapest
        const comparison = [];
        for (const [name, data] of Object.entries(comparisonMap)) {
            data.providers.sort((a, b) => a.costUSD - b.costUSD);
            data.providers.forEach((p, i) => { p.cheapest = i === 0; p.rank = i + 1; });
            comparison.push({
                modelName: name,
                type: data.type,
                providerCount: data.providers.length,
                cheapestProvider: data.providers[0]?.providerName || 'N/A',
                cheapestCost: data.providers[0]?.costLabel || 'N/A',
                providers: data.providers,
            });
        }
        // Group comparison by type
        comparison.sort((a, b) => {
            const order = { text: 0, image: 1, video: 2, voice: 3 };
            return (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.modelName.localeCompare(b.modelName);
        });

        res.json({
            success: true,
            providers: liveProviders,
            comparison,
            baselines,
            lastCheck,
            alerts: alerts.slice(0, 50),
            alertCount: alerts.length,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/pricing-monitor/check — Trigger manual check
router.post('/pricing-monitor/check', async (req, res) => {
    try {
        const changes = await checkPricingChanges();

        await logAudit(req, {
            action: 'PRICING_MONITOR_CHECK',
            targetModel: 'SystemSettings',
            metadata: { changesFound: changes.length },
        });

        res.json({
            success: true,
            changes,
            message: changes.length > 0
                ? `⚠️ ${changes.length} pricing change(s) detected!`
                : '✅ No pricing changes detected — all costs match baselines.',
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /superadmin/pricing-monitor/dismiss — Clear alerts
router.post('/pricing-monitor/dismiss', async (req, res) => {
    try {
        await setSetting('pricing_alerts', []);
        res.json({ success: true, message: 'All pricing alerts dismissed' });
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

// GET /superadmin/pricing-calculator — Cost vs Revenue analysis per action
router.get('/pricing-calculator', async (req, res) => {
    try {
        const costs = await getCreditCosts();
        const { creditPriceINR = 2, usdToInr = 85, targetMargin = 60 } = req.query;
        const pricePerCredit = parseFloat(creditPriceINR);
        const exchangeRate = parseFloat(usdToInr);
        const margin = parseFloat(targetMargin);

        // Estimated API cost per action (USD cents) based on typical token usage
        // Text actions: ~2K input + ~1K output tokens average
        // Image actions: flat per-image cost
        // Video actions: flat per-generation cost
        const ACTION_API_COSTS = {
            content: 0.15,           // ~3K tokens on gemini-1.5-flash-latest
            contentRefine: 0.10,     // ~2K tokens
            creative: 4.0,           // Gemini image gen (~$0.04/image)
            photoshoot: 4.5,         // Gemini image gen + ref images
            seoHealthCheck: 0.20,    // ~4K tokens on gemini-1.5-flash-latest
            seoTraffic: 0.20,
            seoCompetitors: 0.25,
            seoAiVisibility: 0.25,
            seoAsk: 0.08,           // ~1K tokens
            seoAuditPage: 0.15,
            seoCompetitorDiscover: 0.10,
            seoBacklinks: 0.30,     // ~6K tokens
            seoWarRoom: 0.35,       // ~8K tokens
            seoLlmProbe: 0.25,
            seoAutoFix: 0.15,
            seoPromptMining: 0.20,
            brainstorm: 0.20,       // ~4K tokens on grok
            brainstormRefine: 0.12,
            brainstormChat: 0.10,
            brainstormScreenplay: 0.30,
            trendRefresh: 0.12,
            videoBrainstorm: 0.15,
            videoGenerate: 10.0,     // PiAPI/Seedance (~$0.10/video)
            videoEdit: 5.0,
            socialMedia: 0.20,
            socialMediaCalendar: 0.25,
            socialMediaAudit: 0.30,
            socialMediaCompetitor: 0.30,
            socialMediaScore: 0.15,
            canvasGenerate: 4.0,     // Gemini image gen
            canvasBgRemove: 4.0,
            canvasExtend: 4.0,
            adCreative: 4.0,         // Gemini image gen
            voiceClone: 2.0,         // MiniMax Speech-02 HD
            voiceTranscribe: 0.50,   // Sarvam STT
        };

        // Human-readable labels
        const ACTION_LABELS = {
            content: 'Content Generate', contentRefine: 'Content Refine',
            creative: 'Creative Image', photoshoot: 'AI Photoshoot',
            seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic', seoCompetitors: 'SEO Competitors',
            seoAiVisibility: 'SEO AI Visibility', seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit',
            seoCompetitorDiscover: 'SEO Discover', seoBacklinks: 'SEO Backlinks', seoWarRoom: 'SEO War Room',
            seoLlmProbe: 'SEO LLM Probe', seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining',
            brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine', brainstormChat: 'Brainstorm Chat',
            brainstormScreenplay: 'Screenplay', trendRefresh: 'Trend Refresh',
            videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generate', videoEdit: 'Video Edit',
            socialMedia: 'Social Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Audit',
            socialMediaCompetitor: 'Social Competitor', socialMediaScore: 'Social Score',
            canvasGenerate: 'Canvas AI Generate', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend',
            adCreative: 'Ad Creative', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe',
        };

        // Studios mapping
        const studioOf = (a) => {
            if (a.startsWith('seo')) return 'SEO';
            if (a.startsWith('brainstorm') || a === 'trendRefresh') return 'Brainstorm';
            if (a.startsWith('video')) return 'Video';
            if (a.startsWith('social')) return 'Social Media';
            if (a.startsWith('canvas')) return 'Creative (Canvas)';
            if (['content', 'contentRefine'].includes(a)) return 'Content';
            if (['creative', 'photoshoot'].includes(a)) return 'Creative';
            if (a === 'adCreative') return 'Performance Marketing';
            if (a.startsWith('voice')) return 'Voice';
            return 'Other';
        };

        // Build per-action breakdown
        const actions = Object.entries(costs).map(([action, creditCost]) => {
            const apiCostCents = ACTION_API_COSTS[action] || 0.10;
            const apiCostINR = (apiCostCents / 100) * exchangeRate;
            const revenueINR = creditCost * pricePerCredit;
            const profitINR = revenueINR - apiCostINR;
            const marginPct = revenueINR > 0 ? ((profitINR / revenueINR) * 100) : 0;
            const status = marginPct >= 50 ? 'profitable' : marginPct >= 20 ? 'breakeven' : 'loss';

            return {
                action,
                label: ACTION_LABELS[action] || action,
                studio: studioOf(action),
                creditCost,
                apiCostUSD: Math.round(apiCostCents) / 100,
                apiCostINR: Math.round(apiCostINR * 100) / 100,
                revenueINR: Math.round(revenueINR * 100) / 100,
                profitINR: Math.round(profitINR * 100) / 100,
                marginPct: Math.round(marginPct),
                status,
            };
        });

        // Studio summaries
        const studioSummary = {};
        actions.forEach(a => {
            if (!studioSummary[a.studio]) studioSummary[a.studio] = { actions: 0, avgMargin: 0, totalApiCostINR: 0, totalRevenueINR: 0, losses: 0 };
            const s = studioSummary[a.studio];
            s.actions++;
            s.totalApiCostINR += a.apiCostINR;
            s.totalRevenueINR += a.revenueINR;
            if (a.status === 'loss') s.losses++;
        });
        Object.values(studioSummary).forEach(s => {
            s.avgMargin = s.totalRevenueINR > 0 ? Math.round(((s.totalRevenueINR - s.totalApiCostINR) / s.totalRevenueINR) * 100) : 0;
        });

        // Recommended credit price per target margin
        const recommendedPrices = actions.map(a => {
            const apiCostINR = a.apiCostINR;
            const reqPrice = apiCostINR / (1 - margin / 100);
            return { action: a.action, label: a.label, currentPriceINR: a.revenueINR, recommendedPriceINR: Math.round(reqPrice * 100) / 100, recommendedPerCredit: a.creditCost > 0 ? Math.round((reqPrice / a.creditCost) * 100) / 100 : 0 };
        });

        // Get actual usage data from DB (last 30 days)
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const usageData = await CreditUsage.aggregate([
            { $match: { createdAt: { $gte: since } } },
            { $group: { _id: '$action', count: { $sum: 1 }, totalCredits: { $sum: '$cost' }, totalTokens: { $sum: '$tokenUsage.totalTokens' }, estimatedAPICost: { $sum: '$tokenUsage.estimatedCost' } } },
            { $sort: { totalCredits: -1 } },
        ]);
        const usageMap = usageData.reduce((m, u) => { m[u._id] = u; return m; }, {});

        // Enrich actions with actual usage
        actions.forEach(a => {
            const u = usageMap[a.action];
            a.last30d = u ? { count: u.count, totalCredits: u.totalCredits, actualAPICostUSD: Math.round((u.estimatedAPICost || 0) * 100) / 100 } : { count: 0, totalCredits: 0, actualAPICostUSD: 0 };
        });

        // Overall summary
        const totalEstApiCost = actions.reduce((s, a) => s + (a.last30d.count * a.apiCostINR), 0);
        const totalRevenue = actions.reduce((s, a) => s + (a.last30d.totalCredits * pricePerCredit), 0);

        res.json({
            success: true,
            config: { creditPriceINR: pricePerCredit, usdToInr: exchangeRate, targetMargin: margin },
            summary: {
                totalActions: actions.length,
                profitableActions: actions.filter(a => a.status === 'profitable').length,
                breakevenActions: actions.filter(a => a.status === 'breakeven').length,
                lossActions: actions.filter(a => a.status === 'loss').length,
                estimatedMonthlyAPICostINR: Math.round(totalEstApiCost),
                estimatedMonthlyRevenueINR: Math.round(totalRevenue),
                overallMarginPct: totalRevenue > 0 ? Math.round(((totalRevenue - totalEstApiCost) / totalRevenue) * 100) : 0,
            },
            actions,
            studioSummary,
            recommendedPrices,
            modelCosts: MODEL_COSTS,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export const creditRouter = Router();

// Import daily reward middleware
import { trackDailyLogin } from '../middleware/dailyReward.js';

creditRouter.get('/balance', protect, trackDailyLogin, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const costs = await getCreditCosts();
        res.json({
            success: true,
            ...getCreditBalance(user),
            plan: user.plan,
            costs,
            streak: user.streak || 0,
            dailyReward: req.dailyReward || null, // From trackDailyLogin middleware
        });
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

// ══════════════════════════════════════════════════════════════
// STUDIO ACCESS CONTROL (Portal Visibility + Per-User Overrides)
// ══════════════════════════════════════════════════════════════
import { STUDIO_KEYS, STUDIO_LABELS, getPortalVisibility, resolveStudioAccess } from '../middleware/studioAccess.js';
import { setMaxListeners } from 'events';

/**
 * GET /api/superadmin/studio-visibility
 * Returns portal-level visibility for all studios
 */
router.get('/studio-visibility', async (req, res) => {
    try {
        const portalVisibility = await getPortalVisibility();
        res.json({ success: true, portalVisibility, studioKeys: STUDIO_KEYS, studioLabels: STUDIO_LABELS });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * PUT /api/superadmin/studio-visibility
 * Update portal-level visibility for studios
 * Body: { visibility: { brainstormStudio: 'public', videoStudio: 'hidden', ... } }
 */
router.put('/studio-visibility', async (req, res) => {
    try {
        const { visibility } = req.body;
        if (!visibility || typeof visibility !== 'object') {
            return res.status(400).json({ success: false, error: 'Missing visibility map' });
        }

        // Validate: only allow known keys and valid values
        const validStates = ['public', 'private', 'hidden'];
        const cleaned = {};
        for (const [key, val] of Object.entries(visibility)) {
            if (STUDIO_KEYS.includes(key) && validStates.includes(val)) {
                cleaned[key] = val;
            }
        }

        const before = await getPortalVisibility();
        await setSetting('studio_portal_visibility', cleaned, req.user._id);
        const after = await getPortalVisibility();

        await logAudit(req, {
            action: 'UPDATE_STUDIO_VISIBILITY',
            targetModel: 'SystemSettings',
            targetId: 'studio_portal_visibility',
            severity: 'high',
            changes: { before, after },
        });

        res.json({ success: true, message: 'Studio visibility updated', portalVisibility: after });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * PUT /api/superadmin/users/:id/studio-access
 * Update per-user studio access overrides
 * Body: { overrides: { videoStudio: true, funnelStudio: false, ... } }
 * Pass null to remove an override (reset to portal default)
 */
router.put('/users/:id/studio-access', async (req, res) => {
    try {
        const { overrides } = req.body;
        if (!overrides || typeof overrides !== 'object') {
            return res.status(400).json({ success: false, error: 'Missing overrides map' });
        }

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        if (user.role === 'superadmin') return res.status(400).json({ success: false, error: 'Cannot override SuperAdmin access' });

        const before = { ...(user.studioAccess || {}) };

        // Apply overrides: set true/false, or delete key to reset to default
        for (const [key, val] of Object.entries(overrides)) {
            if (!STUDIO_KEYS.includes(key)) continue;
            if (val === null || val === undefined) {
                // Reset to default (use plan/portal defaults)
                user.studioAccess[key] = undefined;
            } else {
                user.studioAccess[key] = !!val;
            }
        }

        user.markModified('studioAccess');
        await user.save();

        // Resolve the user's full access after update
        const { access } = await resolveStudioAccess(user);

        await logAudit(req, {
            action: 'UPDATE_USER_STUDIO_ACCESS',
            targetModel: 'User',
            targetId: user._id,
            severity: 'warning',
            metadata: { userName: user.name, userEmail: user.email },
            changes: { before, after: user.studioAccess },
        });

        res.json({ success: true, message: `Studio access updated for ${user.name}`, resolvedAccess: access });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * GET /api/superadmin/users/:id/studio-access
 * Get resolved studio access for a specific user (for the per-user modal)
 */
router.get('/users/:id/studio-access', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const { access, portalVisibility } = await resolveStudioAccess(user);
        const userOverrides = user.studioAccess || {};

        res.json({
            success: true,
            userName: user.name,
            userEmail: user.email,
            userPlan: user.plan,
            resolvedAccess: access,
            portalVisibility,
            userOverrides,
            studioKeys: STUDIO_KEYS,
            studioLabels: STUDIO_LABELS,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

