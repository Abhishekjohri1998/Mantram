import { Router } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import config from '../config/env.js';
import SubscriptionPackage from '../models/SubscriptionPackage.js';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { getSetting } from '../models/SystemSettings.js';
import RetentionOffer from '../models/RetentionOffer.js';
import Coupon from '../models/Coupon.js';
import Integration from '../models/Integration.js';
import {
    createRecurringCharge,
    createOneTimeCharge,
    getSubscriptionDetails,
    getOneTimePurchaseDetails
} from '../services/shopifyBilling.js';

const router = Router();

// USD Pricing mapping for Shopify Billing
const SUBSCRIPTION_USD_PRICING = {
    creator: {
        monthly: 19.99,
        quarterly: 49.99,
        yearly: 199.99,
    },
    professional: {
        monthly: 49.99,
        quarterly: 129.99,
        yearly: 499.99,
    }
};

const CREDIT_PACK_USD_PRICING = {
    'festive-special': 29.99,
    'micro': 1.99,
    'spark': 3.99,
    'boost': 9.99,
    'power': 19.99,
    'ultra': 24.99,
    'stellar': 29.99,
    'mega': 49.99,
    'elite': 99.99,
    'enterprise-pack': 179.99,
};

function getUSDPriceForPackage(slug, billingCycle, inrPrice) {
    if (SUBSCRIPTION_USD_PRICING[slug] && SUBSCRIPTION_USD_PRICING[slug][billingCycle]) {
        return SUBSCRIPTION_USD_PRICING[slug][billingCycle];
    }
    return parseFloat((inrPrice / 90).toFixed(2));
}

function getUSDPriceForCreditPack(slug, inrPrice) {
    if (CREDIT_PACK_USD_PRICING[slug]) {
        return CREDIT_PACK_USD_PRICING[slug];
    }
    return parseFloat((inrPrice / 90).toFixed(2));
}


let razorpay;
function getRazorpay() {
    if (!razorpay) {
        if (!config.razorpay?.keyId || !config.razorpay?.keySecret) {
            console.error('❌ RAZORPAY CONFIG ERROR: Missing KEY_ID or KEY_SECRET in .env');
            throw new Error('Razorpay keys not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env (and restart server)');
        }
        razorpay = new Razorpay({
            key_id: config.razorpay.keyId,
            key_secret: config.razorpay.keySecret,
        });
    }
    return razorpay;
}

// @desc    Get store visibility settings (which store sections are enabled)
// @route   GET /api/payments/store-visibility
// @access  Public (logged-in users)
router.get('/store-visibility', protect, async (req, res) => {
    try {
        const showSubscriptionPlans = await getSetting('show_subscription_plans', true);
        const showCreditPacks = await getSetting('show_credit_packs', true);
        res.json({ success: true, showSubscriptionPlans, showCreditPacks });
    } catch (error) {
        res.json({ success: true, showSubscriptionPlans: true, showCreditPacks: true });
    }
});

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


// ═══════════════════════════════════════════════════
// Pro-rata helper
// ═══════════════════════════════════════════════════
function calcProRata(activeSub, newPlanPrice) {
    if (!activeSub || !activeSub.endDate || !activeSub.startDate) {
        return { unusedCredit: 0, proRataAmount: newPlanPrice, daysRemaining: 0, totalDays: 0 };
    }
    const now = new Date();
    const end = new Date(activeSub.endDate);
    const start = new Date(activeSub.startDate);
    if (end <= now) {
        return { unusedCredit: 0, proRataAmount: newPlanPrice, daysRemaining: 0, totalDays: 0 };
    }
    const msPerDay = 86400000;
    const totalDays = Math.max(1, Math.ceil((end - start) / msPerDay));
    const daysRemaining = Math.max(0, Math.ceil((end - now) / msPerDay));
    const dailyRate = (activeSub.price || 0) / totalDays;
    const unusedCredit = Math.round(dailyRate * daysRemaining * 100) / 100;
    const proRataAmount = Math.max(0, Math.round((newPlanPrice - unusedCredit) * 100) / 100);
    return { unusedCredit, proRataAmount, daysRemaining, totalDays, dailyRate: Math.round(dailyRate * 100) / 100 };
}

// @desc    Validate Coupon
// @route   POST /api/payments/validate-coupon
// @access  Private
router.post('/validate-coupon', protect, async (req, res) => {
    try {
        const { code, packageId, packId, billingCycle = 'monthly' } = req.body;
        if (!code) return res.status(400).json({ success: false, error: 'Coupon code required' });

        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
        if (!coupon) return res.status(404).json({ success: false, error: 'Invalid coupon code' });

        // Validity checks
        const now = new Date();
        if (coupon.validFrom && now < coupon.validFrom) return res.status(400).json({ success: false, error: 'Coupon is not yet active' });
        if (coupon.validUntil && now > coupon.validUntil) return res.status(400).json({ success: false, error: 'Coupon has expired' });
        if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ success: false, error: 'Coupon usage limit reached' });

        // Per-user limit
        const userUses = coupon.usedBy.filter(u => u.user.toString() === req.user._id.toString()).length;
        if (coupon.maxUsesPerUser > 0 && userUses >= coupon.maxUsesPerUser) {
            return res.status(400).json({ success: false, error: 'You have already used this coupon' });
        }

        // Get original price
        let originalPrice = 0;
        let planSlug = '';
        if (packageId) {
            const pkg = await SubscriptionPackage.findById(packageId);
            if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });
            originalPrice = pkg.pricing[billingCycle] || pkg.pricing.monthly;
            planSlug = pkg.slug;
        } else if (packId) {
            const pack = await CreditPack.findById(packId);
            if (!pack) return res.status(404).json({ success: false, error: 'Credit pack not found' });
            originalPrice = pack.price;
        } else {
            return res.status(400).json({ success: false, error: 'packageId or packId required for validation' });
        }

        // Plan restriction
        if (coupon.applicablePlans?.length > 0 && planSlug && !coupon.applicablePlans.includes(planSlug)) {
            return res.status(400).json({ success: false, error: `This coupon is not valid for the ${planSlug} plan` });
        }

        // Min purchase amount
        if (coupon.minPurchaseAmount > 0 && originalPrice < coupon.minPurchaseAmount) {
            return res.status(400).json({ success: false, error: `Minimum purchase of ₹${coupon.minPurchaseAmount} required for this coupon` });
        }

        // Calculate discount
        let discount = 0;
        if (coupon.discountType === 'percentage') {
            discount = Math.round((originalPrice * coupon.discountValue) / 100);
        } else if (coupon.discountType === 'fixed') {
            discount = Math.min(coupon.discountValue, originalPrice);
        }

        res.json({
            success: true,
            coupon: {
                code: coupon.code,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                description: coupon.description,
            },
            originalPrice,
            discount,
            finalPrice: Math.max(0, originalPrice - discount),
        });
    } catch (error) {
        console.error('❌ Validate Coupon Error:', error);
        res.status(500).json({ success: false, error: 'Validation failed' });
    }
});

// @desc    Create Razorpay Order (with pro-rata for upgrades)
// @route   POST /api/payments/create-order
// @access  Private
router.post('/create-order', protect, async (req, res) => {
    try {
        const { packageId, billingCycle, couponCode } = req.body;

        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        const fullPrice = pkg.pricing[billingCycle] || pkg.pricing.monthly;
        if (!fullPrice || fullPrice <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid plan price' });
        }

        // Pro-rata: check if user has an active subscription
        let proRata = { unusedCredit: 0, proRataAmount: fullPrice, daysRemaining: 0, totalDays: 0 };
        const activeSub = await Subscription.findOne({ user: req.user._id, status: 'active' });
        if (activeSub && activeSub.endDate && new Date(activeSub.endDate) > new Date()) {
            proRata = calcProRata(activeSub, fullPrice);
        }

        // Minimum Razorpay order is ₹1 (100 paise)
        let chargeAmount = Math.max(1, Math.round(proRata.proRataAmount));

        // Apply Coupon
        let discountApplied = 0;
        let appliedCouponCode = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
            if (coupon && (!coupon.validUntil || new Date(coupon.validUntil) > new Date())) {
                if (coupon.discountType === 'percentage') {
                    discountApplied = Math.round((chargeAmount * coupon.discountValue) / 100);
                } else if (coupon.discountType === 'fixed') {
                    discountApplied = Math.min(coupon.discountValue, chargeAmount);
                }
                chargeAmount = Math.max(1, chargeAmount - discountApplied);
                appliedCouponCode = coupon.code;
            }
        }

        const options = {
            amount: chargeAmount * 100, // Amount in paise
            currency: pkg.pricing.currency || 'INR',
            receipt: `receipt_${Date.now()}`,
            notes: {
                userId: req.user._id.toString(),
                packageId: pkg._id.toString(),
                billingCycle,
                proRataCredit: proRata.unusedCredit.toString(),
                fullPrice: fullPrice.toString(),
                isProRata: (proRata.unusedCredit > 0).toString(),
                couponCode: appliedCouponCode || '',
                discountApplied: discountApplied.toString(),
            },
        };

        const order = await getRazorpay().orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            proRata: {
                fullPrice,
                unusedCredit: proRata.unusedCredit,
                chargeAmount,
                daysRemaining: proRata.daysRemaining,
                discountApplied,
                couponCode: appliedCouponCode,
            },
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

        // Deactivate any existing active subscriptions before creating new one
        await Subscription.updateMany(
            { user: req.user._id, status: 'active' },
            { $set: { status: 'expired' } }
        );

        // Read pro-rata data from order notes
        const proRataCredit = parseFloat(order.notes?.proRataCredit) || 0;
        const isProRata = order.notes?.isProRata === 'true';
        const couponCode = order.notes?.couponCode;

        // Create subscription entry
        const subData = {
            user: req.user._id,
            plan: pkg.slug,
            billingCycle,
            credits: {
                total: (pkg.credits.monthly || 0) + (pkg.credits.bonusOnSignup || 0),
                used: 0,
            },
            price: (pkg.pricing[billingCycle] || pkg.pricing.monthly),
            currency: pkg.pricing.currency,
            startDate: new Date(),
            endDate,
            status: 'active',
            paymentMethod: 'razorpay',
            transactionId: razorpay_payment_id,
            proRataCredit: isProRata ? proRataCredit : 0,
            proRataCharged: isProRata ? (order.amount / 100) : 0,
        };

        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (coupon) {
                subData.couponApplied = coupon._id;
                // Track usage
                await Coupon.findByIdAndUpdate(coupon._id, {
                    $inc: { usedCount: 1 },
                    $push: { usedBy: { user: req.user._id, usedAt: new Date() } }
                });
            }
        }

        const subscription = await Subscription.create(subData);

        // Update user
        await User.findByIdAndUpdate(req.user._id, {
            plan: pkg.slug,
            activeSubscription: subscription._id,
            'credits.total': (pkg.credits.monthly || 0) + (pkg.credits.bonusOnSignup || 0),
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
        const { packId, couponCode } = req.body;

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

        // Apply Coupon
        let chargeAmount = pack.price;
        let discountApplied = 0;
        let appliedCouponCode = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
            if (coupon && (!coupon.validUntil || new Date(coupon.validUntil) > new Date())) {
                if (coupon.discountType === 'percentage') {
                    discountApplied = Math.round((chargeAmount * coupon.discountValue) / 100);
                } else if (coupon.discountType === 'fixed') {
                    discountApplied = Math.min(coupon.discountValue, chargeAmount);
                }
                chargeAmount = Math.max(1, chargeAmount - discountApplied);
                appliedCouponCode = coupon.code;
            }
        }

        const options = {
            amount: chargeAmount * 100, // paise
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
                couponCode: appliedCouponCode || '',
                discountApplied: discountApplied.toString(),
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
            { returnDocument: 'after' }
        );

        // Update pack purchase stats
        if (order.notes.packId) {
            await CreditPack.findByIdAndUpdate(order.notes.packId, {
                $inc: { purchaseCount: 1, totalRevenue: order.amount / 100 },
            });
        }

        // Track coupon usage
        if (order.notes.couponCode) {
            await Coupon.findOneAndUpdate(
                { code: order.notes.couponCode.toUpperCase() },
                {
                    $inc: { usedCount: 1 },
                    $push: { usedBy: { user: req.user._id, usedAt: new Date() } }
                }
            );
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

// ═══════════════════════════════════════════════════
//  SUBSCRIPTION STATUS, CANCEL, RETENTION, PREVIEW
// ═══════════════════════════════════════════════════

/**
 * @desc    Get current subscription status + remaining days
 * @route   GET /api/payments/subscription-status
 * @access  Private
 */
router.get('/subscription-status', protect, async (req, res) => {
    try {
        const sub = await Subscription.findOne({ user: req.user._id })
            .sort('-createdAt')
            .lean();
        if (!sub) {
            return res.json({
                success: true,
                hasSubscription: false,
                plan: req.user.plan || 'starter',
                status: 'none',
            });
        }

        const now = new Date();
        const end = sub.gracePeriodEnd || sub.endDate;
        const msPerDay = 86400000;
        const daysRemaining = end ? Math.max(0, Math.ceil((new Date(end) - now) / msPerDay)) : 0;
        const isCancelled = sub.status === 'cancelled';
        const isInGracePeriod = isCancelled && end && new Date(end) > now;

        res.json({
            success: true,
            hasSubscription: true,
            subscriptionId: sub._id,
            plan: sub.plan,
            billingCycle: sub.billingCycle,
            status: sub.status,
            price: sub.price,
            currency: sub.currency,
            startDate: sub.startDate,
            endDate: sub.endDate,
            daysRemaining,
            isCancelled,
            isInGracePeriod,
            gracePeriodEnd: sub.gracePeriodEnd,
            cancelledAt: sub.cancelledAt,
            cancelReason: sub.cancelReason,
            autoRenew: sub.autoRenew,
            retentionOfferApplied: sub.retentionOfferApplied,
            paymentMethod: sub.paymentMethod,
        });
    } catch (error) {
        console.error('❌ Subscription Status Error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch status' });
    }
});

/**
 * @desc    Preview upgrade cost (pro-rata calculation)
 * @route   GET /api/payments/upgrade-preview?packageId=xxx&billingCycle=monthly
 * @access  Private
 */
router.get('/upgrade-preview', protect, async (req, res) => {
    try {
        const { packageId, billingCycle = 'monthly' } = req.query;
        if (!packageId) {
            return res.status(400).json({ success: false, error: 'packageId required' });
        }

        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        const newPrice = pkg.pricing[billingCycle] || pkg.pricing.monthly;
        const activeSub = await Subscription.findOne({ user: req.user._id, status: 'active' });

        let proRata = { unusedCredit: 0, proRataAmount: newPrice, daysRemaining: 0, totalDays: 0 };
        if (activeSub && activeSub.endDate && new Date(activeSub.endDate) > new Date()) {
            proRata = calcProRata(activeSub, newPrice);
        }

        res.json({
            success: true,
            currentPlan: activeSub?.plan || req.user.plan,
            newPlan: pkg.name,
            newPlanSlug: pkg.slug,
            billingCycle,
            fullPrice: newPrice,
            unusedCredit: proRata.unusedCredit,
            chargeAmount: Math.max(1, Math.round(proRata.proRataAmount)),
            daysRemainingOnCurrent: proRata.daysRemaining,
            totalDaysInCycle: proRata.totalDays,
            currency: pkg.pricing.currency || 'INR',
        });
    } catch (error) {
        console.error('❌ Upgrade Preview Error:', error);
        res.status(500).json({ success: false, error: 'Failed to calculate upgrade' });
    }
});

/**
 * @desc    Cancel subscription (keeps access until billing period end)
 * @route   POST /api/payments/cancel-subscription
 * @access  Private
 */
router.post('/cancel-subscription', protect, async (req, res) => {
    try {
        const { reason } = req.body;

        const sub = await Subscription.findOne({
            user: req.user._id,
            status: 'active',
        });
        if (!sub) {
            return res.status(404).json({ success: false, error: 'No active subscription to cancel' });
        }

        // Set grace period = remaining billing period
        const gracePeriodEnd = sub.endDate || new Date();
        const now = new Date();
        const msPerDay = 86400000;
        const daysRemaining = Math.max(0, Math.ceil((new Date(gracePeriodEnd) - now) / msPerDay));

        sub.status = 'cancelled';
        sub.cancelledAt = now;
        sub.cancelReason = reason || '';
        sub.gracePeriodEnd = gracePeriodEnd;
        sub.autoRenew = false;
        await sub.save();

        // Fetch best matching retention offer to show user
        const retentionOffer = await RetentionOffer.findOne({
            isActive: true,
            $and: [
                { $or: [{ targetPlans: { $size: 0 } }, { targetPlans: sub.plan }] },
                { $or: [{ maxClaims: 0 }, { $expr: { $lt: ['$claimCount', '$maxClaims'] } }] },
            ],
        }).sort('-priority').lean();

        console.log(`🚫 Subscription cancelled for ${req.user.email} — ${daysRemaining} days remaining`);

        res.json({
            success: true,
            message: `Subscription cancelled. You have access to ${sub.plan} features until ${new Date(gracePeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
            daysRemaining,
            gracePeriodEnd,
            plan: sub.plan,
            retentionOffer: retentionOffer ? {
                id: retentionOffer._id,
                name: retentionOffer.name,
                headline: retentionOffer.headline,
                description: retentionOffer.description,
                offerType: retentionOffer.offerType,
                value: retentionOffer.value,
                duration: retentionOffer.duration,
                icon: retentionOffer.icon,
                color: retentionOffer.color,
            } : null,
        });
    } catch (error) {
        console.error('❌ Cancel Subscription Error:', error);
        res.status(500).json({ success: false, error: 'Cancellation failed' });
    }
});

/**
 * @desc    Accept retention offer (reverts cancellation, applies benefit)
 * @route   POST /api/payments/accept-retention-offer
 * @access  Private
 */
router.post('/accept-retention-offer', protect, async (req, res) => {
    try {
        const { offerId } = req.body;
        if (!offerId) {
            return res.status(400).json({ success: false, error: 'offerId required' });
        }

        const offer = await RetentionOffer.findById(offerId);
        if (!offer || !offer.isActive) {
            return res.status(404).json({ success: false, error: 'Offer not found or expired' });
        }

        // Check claims limit
        if (offer.maxClaims > 0 && offer.claimCount >= offer.maxClaims) {
            return res.status(400).json({ success: false, error: 'Offer is fully claimed' });
        }

        const sub = await Subscription.findOne({
            user: req.user._id,
            status: 'cancelled',
        }).sort('-cancelledAt');

        if (!sub) {
            return res.status(404).json({ success: false, error: 'No cancelled subscription found' });
        }

        // Revert cancellation
        sub.status = 'active';
        sub.cancelledAt = undefined;
        sub.cancelReason = '';
        sub.gracePeriodEnd = undefined;  // Clear grace period to hide cancelled banner
        sub.retentionOfferApplied = true;
        sub.retentionOfferId = offer._id;

        // Apply benefit based on type
        let benefit = '';
        switch (offer.offerType) {
            case 'discount': {
                const discountPct = offer.value;
                benefit = `${discountPct}% discount on your next ${offer.duration} renewal(s)`;
                sub.notes = `Retention: ${discountPct}% off for ${offer.duration} cycle(s)`;
                break;
            }
            case 'bonus_credits': {
                const bonusCredits = parseInt(offer.value);
                await User.findByIdAndUpdate(req.user._id, {
                    $inc: { 'credits.bonus': bonusCredits },
                });
                benefit = `${bonusCredits} bonus credits added to your account`;
                break;
            }
            case 'free_month': {
                const freeMonths = parseInt(offer.value) || 1;
                const newEnd = new Date(sub.endDate);
                newEnd.setMonth(newEnd.getMonth() + freeMonths);
                sub.endDate = newEnd;
                sub.gracePeriodEnd = newEnd;
                benefit = `${freeMonths} free month(s) added — new end date: ${newEnd.toLocaleDateString('en-IN')}`;
                break;
            }
            case 'downgrade': {
                const targetPlan = offer.value;
                const pkg = await SubscriptionPackage.findOne({ slug: targetPlan });
                if (pkg) {
                    sub.plan = targetPlan;
                    sub.price = pkg.pricing.monthly;
                    await User.findByIdAndUpdate(req.user._id, { plan: targetPlan });
                    benefit = `Downgraded to ${pkg.name} at ₹${pkg.pricing.monthly}/mo`;
                }
                break;
            }
        }

        await sub.save();

        // Increment claim count
        await RetentionOffer.findByIdAndUpdate(offerId, { $inc: { claimCount: 1 } });

        console.log(`✅ Retention offer accepted by ${req.user.email}: ${offer.name} — ${benefit}`);

        res.json({
            success: true,
            message: `Welcome back! ${benefit}`,
            plan: sub.plan,
            endDate: sub.endDate,
        });
    } catch (error) {
        console.error('❌ Accept Retention Offer Error:', error);
        res.status(500).json({ success: false, error: 'Failed to apply offer' });
    }
});

// ═══════════════════════════════════════════════════
//  SHOPIFY NATIVE BILLING API ENDPOINTS
// ═══════════════════════════════════════════════════

/**
 * @desc    Get the current active billing provider (shopify or razorpay)
 * @route   GET /api/payments/billing-provider
 * @access  Private
 */
router.get('/billing-provider', protect, async (req, res) => {
    try {
        if (req.shopifyAuth) {
            return res.json({
                success: true,
                provider: 'shopify',
                shopDomain: req.shopifyShop
            });
        }

        const integration = await Integration.findOne({ user: req.user._id, platform: 'shopify', status: 'connected' });
        res.json({
            success: true,
            provider: integration ? 'shopify' : 'razorpay',
            shopDomain: integration ? integration.platformData.shopDomain : null
        });
    } catch (error) {
        console.error('❌ Get Billing Provider Error:', error);
        res.status(500).json({ success: false, error: 'Failed to detect billing provider' });
    }
});

/**
 * @desc    Create Shopify Recurring Charge (Subscription)
 * @route   POST /api/payments/shopify/create-subscription
 * @access  Private
 */
router.post('/shopify/create-subscription', protect, async (req, res) => {
    try {
        const { packageId, billingCycle = 'monthly' } = req.body;

        const integration = await Integration.findOne({ user: req.user._id, platform: 'shopify', status: 'connected' }).select('+accessToken');
        if (!integration) {
            return res.status(400).json({ success: false, error: 'Shopify integration not connected. Please connect your store first.' });
        }

        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.status(404).json({ success: false, error: 'Package not found' });
        }

        const inrPrice = pkg.pricing[billingCycle] || pkg.pricing.monthly;
        const usdPrice = getUSDPriceForPackage(pkg.slug, billingCycle, inrPrice);

        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        const returnUrl = `${backendUrl}/api/payments/shopify/callback?userId=${req.user._id}&packageId=${pkg._id}&billingCycle=${billingCycle}&shop=${integration.platformData.shopDomain}`;

        console.log(`🛒 Creating Shopify subscription for shop ${integration.platformData.shopDomain}, price: $${usdPrice}`);
        const result = await createRecurringCharge({
            shopDomain: integration.platformData.shopDomain,
            accessToken: integration.accessToken,
            planName: `Mantram AI - ${pkg.name} Plan (${billingCycle})`,
            price: usdPrice,
            interval: billingCycle,
            returnUrl
        });

        res.json({
            success: true,
            confirmationUrl: result.confirmationUrl,
            chargeId: result.chargeId
        });
    } catch (error) {
        console.error('❌ Shopify Create Subscription Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to initialize subscription' });
    }
});

/**
 * @desc    Shopify Subscription callback redirected by Shopify
 * @route   GET /api/payments/shopify/callback
 * @access  Public (invoked by merchant redirect after approval)
 */
router.get('/shopify/callback', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const { charge_id, userId, packageId, billingCycle, shop } = req.query;

        if (!charge_id) {
            console.warn('⚠️ Shopify callback missing charge_id');
            return res.redirect(`${frontendUrl}/credits?error=charge_not_approved`);
        }

        const integration = await Integration.findOne({ user: userId, platform: 'shopify', 'platformData.shopDomain': shop }).select('+accessToken');
        if (!integration) {
            console.warn(`⚠️ Shopify callback integration not found for user ${userId}, shop ${shop}`);
            return res.redirect(`${frontendUrl}/credits?error=integration_not_found`);
        }

        const shopifySub = await getSubscriptionDetails(shop, integration.accessToken, charge_id);
        if (!shopifySub || shopifySub.status !== 'ACTIVE') {
            console.warn(`⚠️ Shopify subscription not active: ${charge_id} status is ${shopifySub?.status}`);
            return res.redirect(`${frontendUrl}/credits?error=subscription_inactive`);
        }

        const pkg = await SubscriptionPackage.findById(packageId);
        if (!pkg) {
            return res.redirect(`${frontendUrl}/credits?error=package_not_found`);
        }

        // Calculate end date
        const endDate = new Date();
        if (billingCycle === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
        else endDate.setMonth(endDate.getMonth() + 1);

        // Deactivate any existing active subscriptions before creating new one
        await Subscription.updateMany(
            { user: userId, status: 'active' },
            { $set: { status: 'expired' } }
        );

        // Create subscription entry
        const subData = {
            user: userId,
            plan: pkg.slug,
            billingCycle,
            credits: {
                total: (pkg.credits.monthly || 0) + (pkg.credits.bonusOnSignup || 0),
                used: 0,
            },
            price: parseFloat(shopifySub.lineItems[0].plan.price.amount),
            currency: 'USD',
            startDate: new Date(),
            endDate,
            status: 'active',
            paymentMethod: 'shopify',
            transactionId: charge_id,
        };

        const subscription = await Subscription.create(subData);

        // Update user
        await User.findByIdAndUpdate(userId, {
            plan: pkg.slug,
            activeSubscription: subscription._id,
            'credits.total': (pkg.credits.monthly || 0) + (pkg.credits.bonusOnSignup || 0),
            'credits.used': 0,
        });

        console.log(`✅ Shopify subscription activated for ${shop} (user: ${userId}), plan: ${pkg.slug}`);

        res.redirect(`${frontendUrl}/credits?shopify_billing=success&plan=${pkg.slug}`);
    } catch (error) {
        console.error('❌ Shopify Subscription Callback Error:', error);
        res.redirect(`${frontendUrl}/credits?error=shopify_callback_failed&detail=${encodeURIComponent(error.message)}`);
    }
});

/**
 * @desc    Create Shopify One-Time Purchase for Credit Pack
 * @route   POST /api/payments/shopify/create-topup
 * @access  Private
 */
router.post('/shopify/create-topup', protect, async (req, res) => {
    try {
        const { packId } = req.body;

        const integration = await Integration.findOne({ user: req.user._id, platform: 'shopify', status: 'connected' }).select('+accessToken');
        if (!integration) {
            return res.status(400).json({ success: false, error: 'Shopify integration not connected. Please connect your store first.' });
        }

        const pack = await CreditPack.findById(packId);
        if (!pack || !pack.isActive) {
            return res.status(400).json({ success: false, error: 'Invalid or inactive credit pack' });
        }

        const usdPrice = getUSDPriceForCreditPack(pack.slug, pack.price);

        const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        const returnUrl = `${backendUrl}/api/payments/shopify/topup-callback?userId=${req.user._id}&packId=${pack._id}&shop=${integration.platformData.shopDomain}`;

        console.log(`🛒 Creating Shopify one-time charge for shop ${integration.platformData.shopDomain}, pack: ${pack.name}, price: $${usdPrice}`);
        const result = await createOneTimeCharge({
            shopDomain: integration.platformData.shopDomain,
            accessToken: integration.accessToken,
            packName: `Mantram AI - ${pack.name} Pack`,
            price: usdPrice,
            returnUrl
        });

        res.json({
            success: true,
            confirmationUrl: result.confirmationUrl,
            chargeId: result.chargeId
        });
    } catch (error) {
        console.error('❌ Shopify Create Topup Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to initialize top-up' });
    }
});

/**
 * @desc    Shopify One-time purchase callback redirected by Shopify
 * @route   GET /api/payments/shopify/topup-callback
 * @access  Public (invoked by merchant redirect after approval)
 */
router.get('/shopify/topup-callback', async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
        const { charge_id, userId, packId, shop } = req.query;

        if (!charge_id) {
            console.warn('⚠️ Shopify top-up callback missing charge_id');
            return res.redirect(`${frontendUrl}/credits?error=charge_not_approved`);
        }

        const integration = await Integration.findOne({ user: userId, platform: 'shopify', 'platformData.shopDomain': shop }).select('+accessToken');
        if (!integration) {
            console.warn(`⚠️ Shopify callback integration not found for user ${userId}, shop ${shop}`);
            return res.redirect(`${frontendUrl}/credits?error=integration_not_found`);
        }

        const shopifyPurchase = await getOneTimePurchaseDetails(shop, integration.accessToken, charge_id);
        if (!shopifyPurchase || shopifyPurchase.status !== 'ACTIVE') {
            console.warn(`⚠️ Shopify purchase not active: ${charge_id} status is ${shopifyPurchase?.status}`);
            return res.redirect(`${frontendUrl}/credits?error=purchase_inactive`);
        }

        const pack = await CreditPack.findById(packId);
        if (!pack) {
            return res.redirect(`${frontendUrl}/credits?error=pack_not_found`);
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.redirect(`${frontendUrl}/credits?error=user_not_found`);
        }

        const isFirstPurchase = !user.credits?.topUpExpiry;
        const totalCredits = pack.credits + (pack.bonusCredits || 0);
        const finalCredits = (isFirstPurchase && pack.isFirstPurchaseEligible) ? totalCredits * 2 : totalCredits;

        const validityDays = pack.validityDays || 180;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + validityDays);

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { 'credits.topUp': finalCredits },
                $set: { 'credits.topUpExpiry': expiry },
            },
            { returnDocument: 'after' }
        );

        // Update purchase statistics
        await CreditPack.findByIdAndUpdate(packId, {
            $inc: { purchaseCount: 1, totalRevenue: parseFloat(shopifyPurchase.price.amount) }
        });

        console.log(`💎 Shopify Top-up verified: +${finalCredits} credits for ${updatedUser.email}, expires ${expiry.toISOString()}`);

        res.redirect(`${frontendUrl}/credits?shopify_topup=success&credits=${finalCredits}`);
    } catch (error) {
        console.error('❌ Shopify Top-up Callback Error:', error);
        res.redirect(`${frontendUrl}/credits?error=shopify_callback_failed&detail=${encodeURIComponent(error.message)}`);
    }
});

/**
 * @desc    Cancel Shopify Subscription
 * @route   POST /api/payments/shopify/cancel-subscription
 * @access  Private
 */
router.post('/shopify/cancel-subscription', protect, async (req, res) => {
    try {
        const { reason } = req.body;

        const sub = await Subscription.findOne({
            user: req.user._id,
            status: 'active',
            paymentMethod: 'shopify'
        });

        if (!sub) {
            return res.status(404).json({ success: false, error: 'No active Shopify subscription found to cancel' });
        }

        const integration = await Integration.findOne({ user: req.user._id, platform: 'shopify', status: 'connected' }).select('+accessToken');
        if (!integration) {
            return res.status(400).json({ success: false, error: 'Shopify integration not connected' });
        }

        // Cancel via Shopify GraphQL
        const mutation = `
            mutation appSubscriptionCancel($id: ID!) {
                appSubscriptionCancel(id: $id) {
                    appSubscription {
                        id
                        status
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const cleanDomain = integration.platformData.shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const isLocal = cleanDomain.includes('localhost') || cleanDomain.includes('127.0.0.1');
        const url = `${isLocal ? 'http' : 'https'}://${cleanDomain}/admin/api/2025-01/graphql.json`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': integration.accessToken,
            },
            body: JSON.stringify({
                query: mutation,
                variables: { id: sub.transactionId }
            }),
        });

        if (!response.ok) {
            throw new Error(`Shopify cancel request failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.errors) {
            throw new Error(`Shopify cancel mutation errors: ${JSON.stringify(data.errors)}`);
        }

        const { appSubscriptionCancel } = data.data;
        if (appSubscriptionCancel.userErrors && appSubscriptionCancel.userErrors.length > 0) {
            throw new Error(appSubscriptionCancel.userErrors.map(e => e.message).join(', '));
        }

        // Update local DB subscription
        sub.status = 'cancelled';
        sub.cancelledAt = new Date();
        sub.cancelReason = reason || '';
        sub.gracePeriodEnd = sub.endDate || new Date();
        sub.autoRenew = false;
        await sub.save();

        console.log(`🚫 Shopify Subscription cancelled for shop ${integration.platformData.shopDomain}`);

        res.json({
            success: true,
            message: 'Shopify subscription cancelled. Access remains active until billing period ends.',
            subscription: sub
        });
    } catch (error) {
        console.error('❌ Shopify Cancel Subscription Error:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to cancel subscription' });
    }
});

export default router;

