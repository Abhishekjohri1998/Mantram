/**
 * Rewards & Gamification Routes
 * 
 * Handles: streak status, milestone claims, referral code generation, video cost preview
 */

import { Router } from 'express';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import { estimateCost } from '../agents/videoStudio/falClient.js';

const router = Router();

// ── Milestone reward values ──
const MILESTONE_REWARDS = {
    addedBrand:      { credits: 10, label: 'Added First Brand',     icon: 'storefront' },
    firstContent:    { credits: 5,  label: 'Generated First Content', icon: 'edit_note' },
    firstImage:      { credits: 5,  label: 'Created First Image',   icon: 'palette' },
    firstVideo:      { credits: 10, label: 'Generated First Video',  icon: 'movie' },
    connectedSocial: { credits: 5,  label: 'Connected Social Account', icon: 'share' },
    invitedTeam:     { credits: 15, label: 'Invited First Team Member', icon: 'group_add' },
};

/**
 * @desc    Get rewards status (streak, milestones, referral)
 * @route   GET /api/rewards/status
 * @access  Private
 */
router.get('/status', protect, async (req, res) => {
    try {
        const user = req.user;

        // Streak info
        const today = new Date().toISOString().split('T')[0];
        const loggedInToday = user.lastLoginDate === today;

        // Milestones with claim status
        const milestones = Object.entries(MILESTONE_REWARDS).map(([key, reward]) => ({
            id: key,
            ...reward,
            claimed: user.milestones?.[key] || false,
        }));
        const totalMilestoneCredits = milestones.filter(m => m.claimed).reduce((sum, m) => sum + m.credits, 0);
        const availableMilestoneCredits = milestones.filter(m => !m.claimed).reduce((sum, m) => sum + m.credits, 0);

        // Referral info
        let referralCode = user.referralCode;
        if (!referralCode) {
            // Generate on first access
            referralCode = `MANTRAM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            await User.findByIdAndUpdate(user._id, { referralCode });
        }

        res.json({
            success: true,
            streak: {
                current: user.streak || 0,
                loggedInToday,
                nextReward: (user.streak || 0) < 7 ? { at: 7, bonus: 5 } :
                    (user.streak || 0) < 30 ? { at: 30, bonus: 25 } :
                        { at: Math.ceil(((user.streak || 0) + 1) / 7) * 7, bonus: 5 },
            },
            milestones,
            totalMilestoneCredits,
            availableMilestoneCredits,
            referral: {
                code: referralCode,
                count: user.referralCount || 0,
                creditsEarned: (user.referralCount || 0) * 50,
            },
            topUp: {
                balance: user.credits?.topUp || 0,
                expiresAt: user.credits?.topUpExpiry || null,
                expired: user.credits?.topUpExpiry && new Date(user.credits.topUpExpiry) < new Date(),
            },
        });
    } catch (error) {
        console.error('❌ Rewards Status Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch rewards' });
    }
});

/**
 * @desc    Claim a first-time milestone reward
 * @route   POST /api/rewards/claim-milestone
 * @access  Private
 */
router.post('/claim-milestone', protect, async (req, res) => {
    try {
        const { milestoneId } = req.body;
        const reward = MILESTONE_REWARDS[milestoneId];

        if (!reward) {
            return res.status(400).json({ success: false, error: 'Invalid milestone' });
        }

        const user = req.user;

        // Already claimed?
        if (user.milestones?.[milestoneId]) {
            return res.status(400).json({ success: false, error: 'Milestone already claimed' });
        }

        // Award credits
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            {
                $set: { [`milestones.${milestoneId}`]: true },
                $inc: { 'credits.bonus': reward.credits },
            },
            { new: true }
        );

        console.log(`🎯 Milestone claimed: ${user.email} → ${milestoneId} (+${reward.credits} credits)`);

        res.json({
            success: true,
            message: `${reward.label} — +${reward.credits} bonus credits!`,
            creditsAwarded: reward.credits,
            newBalance: updatedUser.creditsRemaining,
        });
    } catch (error) {
        console.error('❌ Claim Milestone Error:', error);
        res.status(500).json({ success: false, error: 'Failed to claim milestone' });
    }
});

/**
 * @desc    Apply referral code (on signup or later)
 * @route   POST /api/rewards/apply-referral
 * @access  Private
 */
router.post('/apply-referral', protect, async (req, res) => {
    try {
        const { referralCode } = req.body;
        const user = req.user;

        // Already referred
        if (user.referredBy) {
            return res.status(400).json({ success: false, error: 'You have already used a referral code' });
        }

        // Find referrer
        const referrer = await User.findOne({ referralCode });
        if (!referrer) {
            return res.status(404).json({ success: false, error: 'Invalid referral code' });
        }

        // Can't refer yourself
        if (referrer._id.toString() === user._id.toString()) {
            return res.status(400).json({ success: false, error: 'Cannot use your own referral code' });
        }

        // Cap: 500 credits/month from referrals
        const currentMonth = new Date().getMonth();
        const referrerMonthlyCredits = (referrer.referralCount || 0) * 50;
        if (referrerMonthlyCredits >= 500) {
            // Still give the friend bonus, but referrer is capped
        } else {
            // Award referrer: +50 credits
            await User.findByIdAndUpdate(referrer._id, {
                $inc: { 'credits.bonus': 50, referralCount: 1 },
            });
        }

        // Award friend: +30 credits
        await User.findByIdAndUpdate(user._id, {
            $set: { referredBy: referrer._id },
            $inc: { 'credits.bonus': 30 },
        });

        console.log(`👥 Referral applied: ${user.email} → referred by ${referrer.email}`);

        res.json({
            success: true,
            message: 'Referral applied! +30 bonus credits added to your account.',
            creditsAwarded: 30,
        });
    } catch (error) {
        console.error('❌ Apply Referral Error:', error);
        res.status(500).json({ success: false, error: 'Failed to apply referral' });
    }
});

/**
 * @desc    Preview video generation cost before generating
 * @route   POST /api/rewards/video-cost-preview
 * @access  Private
 */
router.post('/video-cost-preview', protect, async (req, res) => {
    try {
        const { model = 'kling-3.0', duration = 5, resolution = '1080p', qualityMode = 'fast' } = req.body;
        const estimate = estimateCost(model, duration, resolution, qualityMode);

        // Apply the same formula as credits.js middleware
        const credits = Math.max(Math.ceil(estimate.usd * 34), 5);

        res.json({
            success: true,
            model,
            duration,
            resolution,
            qualityMode,
            apiCostUSD: estimate.usd,
            apiCostINR: estimate.inr,
            credits,
            userBalance: req.user.creditsRemaining,
            canAfford: req.user.creditsRemaining >= credits,
        });
    } catch (error) {
        console.error('❌ Video Cost Preview Error:', error);
        res.status(500).json({ success: false, error: 'Failed to estimate cost' });
    }
});

export default router;
