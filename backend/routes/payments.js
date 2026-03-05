import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import config from '../config/env.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const router = Router();

const razorpay = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
});

// @desc    Create Razorpay Order
// @route   POST /api/payments/create-order
// @access  Private
router.post('/create-order', protect, async (req, res) => {
    try {
        const { packageId, billingCycle } = req.body;

        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        const amount = pkg.pricing[billingCycle] || pkg.pricing.monthly;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid plan price' });
        }

        const options = {
            amount: amount * 100, // Amount in paise
            currency: pkg.pricing.currency || 'INR',
            receipt: `receipt_${Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                packageId: pkg._id.toString(),
                billingCycle,
            },
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
        });
    } catch (error) {
        console.error('❌ Razorpay Order Error:', error);
        res.status(500).json({ success: false, error: 'Payment initialization failed' });
    }
});

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/verify
// @access  Private
router.post('/verify', protect, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            packageId,
            billingCycle
        } = req.body;

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', config.razorpay.keySecret)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Invalid payment signature' });
        }

        // Signature valid -> Upgrade user plan
        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        // Calculate end date
        const endDate = new Date();
        if (billingCycle === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
        else if (billingCycle === 'quarterly') endDate.setMonth(endDate.getMonth() + 3);
        else endDate.setMonth(endDate.getMonth() + 1);

        // Create subscription entry
        const subscription = await Subscription.create({
            user: req.user._id,
            plan: pkg.slug,
            billingCycle,
            credits: {
                total: pkg.credits.monthly + pkg.credits.bonusOnSignup,
                used: 0,
            },
            price: (pkg.pricing[billingCycle] || pkg.pricing.monthly),
            currency: pkg.pricing.currency,
            startDate: new Date(),
            endDate,
            status: 'active',
            paymentMethod: 'razorpay',
            transactionId: razorpay_payment_id,
        });

        // Update user
        await User.findByIdAndUpdate(req.user._id, {
            plan: pkg.slug,
            activeSubscription: subscription._id,
            'credits.total': pkg.credits.monthly + pkg.credits.bonusOnSignup,
            'credits.used': 0,
        });

        res.json({
            success: true,
            message: 'Payment verified and plan upgraded',
            subscription,
        });
    } catch (error) {
        console.error('❌ Payment Verification Error:', error);
        res.status(500).json({ success: false, error: 'Verification failed' });
    }
});

export default router;
