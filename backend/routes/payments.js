import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import config from '../config/env.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const router = Router();

let razorpay;
function getRazorpay() {
    if (!razorpay) {
        if (!config.razorpay?.keyId || !config.razorpay?.keySecret) {
            throw new Error('Razorpay keys not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
        }
        razorpay = new Razorpay({
            key_id: config.razorpay.keyId,
            key_secret: config.razorpay.keySecret,
        });
    }
    return razorpay;
}

// @desc    Get Available Subscription Packages
// @route   GET /api/payments/packages
// @access  Public
router.get('/packages', async (req, res) => {
    try {
        const packages = await SubscriptionPackage.find().sort({ displayOrder: 1 });
        res.json({ success: true, packages });
    } catch (error) {
        console.error('❌ Get Packages Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch packages' });
    }
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

        const order = await getRazorpay().orders.create(options);

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
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', config.razorpay.keySecret)
            .update(body.toString())
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Invalid payment signature' });
        }

        // BUG-2 FIX: Read packageId and billingCycle from Razorpay order notes
        // instead of trusting req.body (prevents plan upgrade attack)
        const order = await getRazorpay().orders.fetch(razorpay_order_id);
        const packageId = order.notes?.packageId;
        const billingCycle = order.notes?.billingCycle || 'monthly';

        if (!packageId) {
            return res.status(400).json({ success: false, error: 'Order missing package information' });
        }

        // Verify the paying user matches the order creator
        if (order.notes?.userId && order.notes.userId !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Payment user mismatch' });
        }

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

/**
 * @desc    Create Razorpay Order for Credit Top-up
 * @route   POST /api/payments/create-topup-order
 * @access  Private
 */
router.post('/create-topup-order', protect, async (req, res) => {
    try {
        const { creditPackId } = req.body;

        // Define standard top-up packs
        const topupPacks = {
            'pack-100': { credits: 100, price: 50, name: '100 Credits Pack' },
            'pack-500': { credits: 500, price: 200, name: '500 Credits Pack' },
            'pack-1000': { credits: 1000, price: 350, name: '1000 Credits Pack' },
        };

        const pack = topupPacks[creditPackId];
        if (!pack) {
            return res.status(400).json({ success: false, error: 'Invalid credit pack' });
        }

        const options = {
            amount: pack.price * 100, // paise
            currency: 'INR',
            receipt: `topup_${Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                creditPackId,
                credits: pack.credits,
                type: 'credit_topup'
            },
        };

        const order = await getRazorpay().orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            packName: pack.name
        });
    } catch (error) {
        console.error('❌ Topup Order Error:', error);
        res.status(500).json({ success: false, error: 'Top-up initialization failed' });
    }
});

/**
 * @desc    Verify Razorpay Payment for Top-up
 * @route   POST /api/payments/verify-topup
 * @access  Private
 */
router.post('/verify-topup', protect, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const expectedSignature = crypto
            .createHmac('sha256', config.razorpay.keySecret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, error: 'Invalid payment signature' });
        }

        const order = await getRazorpay().orders.fetch(razorpay_order_id);
        if (order.notes?.type !== 'credit_topup') {
            return res.status(400).json({ success: false, error: 'Not a top-up order' });
        }

        const credits = parseInt(order.notes.credits);
        
        // Update user: Increment bonus credits
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { 'credits.bonus': credits } },
            { new: true }
        );

        res.json({
            success: true,
            message: `Successfully added ${credits} credits to your account.`,
            newBalance: user.credits.total + user.credits.bonus - user.credits.used,
            creditsAdded: credits
        });
    } catch (error) {
        console.error('❌ Topup Verification Error:', error);
        res.status(500).json({ success: false, error: 'Top-up verification failed' });
    }
});

export default router;
