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
 * ── Credit Top-Up Packs (DB-driven, admin-managed) ──
 * Packs are stored in CreditPack collection, managed by super admin.
 * Supports: standard packs, promo packs with time-limited discounts,
 * flash sale badges, first-purchase 2× bonus, configurable validity.
 */
import CreditPack from '../models/CreditPack.js';

/**
 * @desc    Get available top-up packs (public store view)
 * @route   GET /api/payments/topup-packs
 * @access  Private
 */
router.get('/topup-packs', protect, async (req, res) => {
    try {
        const user = req.user;
        const isFirstPurchase = !user.credits?.topUpExpiry;
        const now = new Date();

        // Fetch active packs
        const allPacks = await CreditPack.find({ isActive: true })
            .sort({ displayOrder: 1 })
            .lean();

        // Split into promo (active, not expired) and standard
        const promoPacks = [];
        const standardPacks = [];

        for (const pack of allPacks) {
            // Check plan restriction
            if (pack.minPlanRequired && pack.minPlanRequired !== user.plan) continue;

            const total = pack.credits + (pack.bonusCredits || 0);
            const packData = {
                id: pack._id,
                slug: pack.slug,
                name: pack.name,
                credits: pack.credits,
                bonus: pack.bonusCredits || 0,
                total,
                price: pack.price,
                currency: pack.currency || 'INR',
                perCredit: total > 0 ? parseFloat((pack.price / total).toFixed(2)) : 0,
                icon: pack.icon,
                badge: pack.badge,
                badgeColor: pack.badgeColor,
                color: pack.color,
                description: pack.description,
                validityDays: pack.validityDays || 180,
                firstPurchaseTotal: isFirstPurchase && pack.isFirstPurchaseEligible ? total * 2 : null,
                popular: pack.badge === 'Popular' || pack.badge === 'Best Value',
            };

            if (pack.isPromo) {
                // Only include if promo hasn't expired
                if (!pack.promoExpiresAt || new Date(pack.promoExpiresAt) > now) {
                    packData.isPromo = true;
                    packData.promoDiscount = pack.promoDiscount || 0;
                    packData.promoOriginalPrice = pack.promoOriginalPrice || 0;
                    packData.promoLabel = pack.promoLabel || '';
                    packData.promoExpiresAt = pack.promoExpiresAt;
                    promoPacks.push(packData);
                }
            } else {
                standardPacks.push(packData);
            }
        }

        res.json({
            success: true,
            promoPacks,
            standardPacks,
            isFirstPurchase,
        });
    } catch (error) {
        console.error('❌ Get Top-up Packs Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch packs' });
    }
});

/**
 * @desc    Create Razorpay Order for Credit Top-up
 * @route   POST /api/payments/create-topup-order
 * @access  Private
 */
router.post('/create-topup-order', protect, async (req, res) => {
    try {
        const { packId } = req.body;

        // Look up pack from DB
        const pack = await CreditPack.findById(packId);
        if (!pack || !pack.isActive) {
            return res.status(400).json({ success: false, error: 'Invalid or inactive credit pack' });
        }

        // Check promo expiry
        if (pack.isPromo && pack.promoExpiresAt && new Date(pack.promoExpiresAt) < new Date()) {
            return res.status(400).json({ success: false, error: 'This promo has expired' });
        }

        // Check plan restriction
        if (pack.minPlanRequired && pack.minPlanRequired !== req.user.plan) {
            return res.status(403).json({ success: false, error: `This pack requires the ${pack.minPlanRequired} plan` });
        }

        // Calculate credits
        const isFirstPurchase = !req.user.credits?.topUpExpiry;
        const totalCredits = pack.credits + (pack.bonusCredits || 0);
        const finalCredits = (isFirstPurchase && pack.isFirstPurchaseEligible) ? totalCredits * 2 : totalCredits;

        const options = {
            amount: pack.price * 100, // paise
            currency: pack.currency || 'INR',
            receipt: `topup_${Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                packId: pack._id.toString(),
                packSlug: pack.slug,
                credits: finalCredits,
                validityDays: pack.validityDays || 180,
                isFirstPurchase: isFirstPurchase ? 'true' : 'false',
                type: 'credit_topup',
            },
        };

        const order = await getRazorpay().orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            packName: pack.name,
            creditsToAdd: finalCredits,
            isFirstPurchase,
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
        const validityDays = parseInt(order.notes.validityDays) || 180;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + validityDays);

        // Add to topUp credits with validity
        const user = await User.findByIdAndUpdate(
            req.user._id,
            {
                $inc: { 'credits.topUp': credits },
                $set: { 'credits.topUpExpiry': expiry },
            },
            { new: true }
        );

        // Update pack purchase stats
        if (order.notes.packId) {
            await CreditPack.findByIdAndUpdate(order.notes.packId, {
                $inc: { purchaseCount: 1, totalRevenue: order.amount / 100 },
            });
        }

        console.log(`💎 Top-up verified: +${credits} credits for ${user.email}, expires ${expiry.toISOString()}`);

        res.json({
            success: true,
            message: `Successfully added ${credits} credits to your account!`,
            newBalance: user.creditsRemaining,
            creditsAdded: credits,
            expiresAt: expiry,
        });
    } catch (error) {
        console.error('❌ Topup Verification Error:', error);
        res.status(500).json({ success: false, error: 'Top-up verification failed' });
    }
});

export default router;
