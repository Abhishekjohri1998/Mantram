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
import { CREDIT_COSTS, getCreditCosts, getCreditBalance, invalidateCreditCostCache, MODEL_COSTS } from '../middleware/credits.js';
import { protect, authorize, generateToken } from '../middleware/auth.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { logAudit } from '../utils/audit.js';
import CreditUsage from '../models/CreditUsage.js';
import { uploadToS3 } from '../utils/s3.js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import env from '../config/env.js';

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
        const timeout = setTimeout(() => controller.abort(), 10000);
        const resp = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        clearTimeout(timeout);

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
        res.json({ success: true, settings: { watermarkEnabled, defaultProvider, maintenanceMode, watermarkLogoUrl, watermarkPosition, watermarkOpacity, watermarkOverrides } });
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
        await logAudit(req, { action: 'UPDATE_WATERMARK_LOGO', targetModel: 'SystemSettings', targetId: 'watermark_logo', severity: 'medium', metadata: { url } });

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
        ]);

        // Map models to providers
        const providerModels = {
            openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
            anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet', 'claude-3-haiku'],
            gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-image'],
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
            content: 0.15,           // ~3K tokens on gemini-2.5-flash
            contentRefine: 0.10,     // ~2K tokens
            creative: 4.0,           // Gemini image gen (~$0.04/image)
            photoshoot: 4.5,         // Gemini image gen + ref images
            seoHealthCheck: 0.20,    // ~4K tokens on gemini-2.5-flash
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

export default router;
