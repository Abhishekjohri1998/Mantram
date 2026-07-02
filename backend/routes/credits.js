import express from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import crypto from 'crypto';
import { CREDITS_PER_RUPEE } from '../constants/credits.js';
import { getCreditBalance } from '../middleware/credits.js';

const router = express.Router();

/**
 * @desc    Get current user's credit balance
 * @route   GET /api/credits/balance
 * @access  Private
 */
router.get('/balance', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('credits plan role');
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        const balanceData = getCreditBalance(user);
        res.json({
            success: true,
            ...balanceData
        });
    } catch (err) {
        console.error('❌ Get Balance Error:', err);
        res.status(500).json({ success: false, error: 'Failed to get credit balance' });
    }
});

/**
 * @desc    Get paginated credit transaction history
 * @route   GET /api/credits/transactions
 * @access  Private
 */
router.get('/transactions', protect, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const transactions = await CreditTransaction.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await CreditTransaction.countDocuments({ userId: req.user._id });

        res.json({
            success: true,
            transactions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('❌ Get Transactions Error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch transaction history' });
    }
});

/**
 * @desc    Razorpay Webhook for Payment Captured
 * @route   POST /api/credits/webhook/razorpay
 * @access  Public (Webhook)
 */
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) return res.status(400).json({ error: 'Webhook secret not configured' });

        const signature = req.headers['x-razorpay-signature'];
        const payload = req.body; // if using raw middleware, this is a buffer. If parsed, it's string/json.
        
        // Webhook verification
        const bodyStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : JSON.stringify(payload);
        const expectedSignature = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
        
        if (expectedSignature !== signature) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const data = Buffer.isBuffer(payload) ? JSON.parse(bodyStr) : payload;
        
        if (data.event === 'payment.captured') {
            const payment = data.payload.payment.entity;
            const amountInr = payment.amount / 100;
            const orderId = payment.order_id;
            const referenceId = payment.id;
            const userId = payment.notes?.userId; // Ensure client passes userId in notes when creating order!

            if (!userId) {
                console.warn('⚠️ Razorpay webhook received but no userId in notes');
                return res.json({ status: 'ignored', reason: 'no userId' });
            }

            // Idempotency check
            const exists = await CreditTransaction.findOne({ referenceId });
            if (exists) {
                console.log(`🔐 Idempotency check: Transaction ${referenceId} already processed.`);
                return res.json({ status: 'ok', reason: 'already processed' });
            }

            const creditsToAdd = Math.floor(amountInr * CREDITS_PER_RUPEE);

            // Add credits atomically
            const updatedUser = await User.findByIdAndUpdate(userId, {
                $inc: { credits: creditsToAdd }
            }, { returnDocument: 'after' });

            if (!updatedUser) {
                console.warn(`⚠️ Webhook user ${userId} not found`);
                return res.status(404).json({ error: 'User not found' });
            }

            // Record transaction
            await CreditTransaction.create({
                userId,
                type: 'purchase',
                amount: creditsToAdd,
                inrAmount: amountInr,
                balanceAfter: updatedUser.credits,
                referenceId
            });
            
            console.log(`✅ Webhook: Added ${creditsToAdd} credits to user ${userId} for ₹${amountInr}`);
        }

        res.json({ status: 'ok' });
    } catch (err) {
        console.error('❌ Razorpay Webhook Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @desc    Grant bonus credits to a user
 * @route   POST /api/credits/bonus
 * @access  Superadmin
 */
router.post('/bonus', protect, superadmin, async (req, res) => {
    try {
        const { targetUserId, amount, reason } = req.body;
        if (!targetUserId || !amount) {
            return res.status(400).json({ success: false, error: 'targetUserId and amount required' });
        }

        const creditsToAdd = parseInt(amount);
        
        const updatedUser = await User.findByIdAndUpdate(targetUserId, {
            $inc: { credits: creditsToAdd }
        }, { returnDocument: 'after' });

        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        await CreditTransaction.create({
            userId: targetUserId,
            type: 'bonus',
            amount: creditsToAdd,
            balanceAfter: updatedUser.credits,
            relatedJobId: reason || 'Admin granted bonus'
        });

        res.json({
            success: true,
            message: `Added ${creditsToAdd} bonus credits to user`,
            newBalance: updatedUser.credits
        });
    } catch (err) {
        console.error('❌ Grant Bonus Error:', err);
        res.status(500).json({ success: false, error: 'Failed to grant bonus credits' });
    }
});

export default router;
