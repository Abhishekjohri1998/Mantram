import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ── Creative User ID Generator ──
const USER_ID_ADJECTIVES = [
    'cosmic', 'turbo', 'neon', 'cyber', 'ultra', 'pixel', 'atomic', 'hyper',
    'stellar', 'blaze', 'storm', 'shadow', 'royal', 'epic', 'quantum', 'mighty',
    'velvet', 'golden', 'mystic', 'prism', 'lunar', 'solar', 'rapid', 'noble',
    'thunder', 'crystal', 'phantom', 'titan', 'frost', 'crimson', 'azure', 'viper',
];
const USER_ID_NOUNS = [
    'ninja', 'sultan', 'maverick', 'falcon', 'phoenix', 'rambo', 'wizard', 'spartan',
    'ranger', 'voyager', 'crusader', 'legend', 'knight', 'ace', 'captain', 'hunter',
    'pilot', 'chief', 'pioneer', 'rebel', 'warrior', 'gladiator', 'dreamer', 'creator',
    'hustler', 'genius', 'guru', 'monk', 'oracle', 'sage', 'wolf', 'hawk',
];

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'admin', 'team-member', 'superadmin'], default: 'user' },
    plan: { type: String, default: 'starter' },
    avatar: { type: String, default: '' },
    company: { type: String, default: '' },

    // Creative User ID (e.g., "cosmic-ninja-42")
    userId: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
    userIdClaimed: { type: Boolean, default: false }, // true = user chose their ID, no more changes

    // Team / Organization
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    teamRole: { type: String, enum: ['owner', 'manager', 'member', ''], default: '' },

    // Per-studio access overrides (SuperAdmin can grant/revoke per-user)
    // undefined = no override (use portal/plan defaults)
    // true = explicitly granted
    // false = explicitly revoked
    studioAccess: {
        contentStudio: { type: Boolean },
        creativeStudio: { type: Boolean },
        seoStudio: { type: Boolean },
        brainstormStudio: { type: Boolean },
        videoStudio: { type: Boolean },
        socialMediaStudio: { type: Boolean },
        conversationStudio: { type: Boolean },
        adStudio: { type: Boolean },
        funnelStudio: { type: Boolean },
        d2cAnalytics: { type: Boolean },
        skillsHub: { type: Boolean },
    },

    // Which brands this team member can access
    brandAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

    // Credits
    credits: {
        total: { type: Number, default: 100 },
        used: { type: Number, default: 0 },
        bonus: { type: Number, default: 0 }, // extra credits from coupons/admin
        resetDate: { type: Date }, // next monthly reset date
        topUp: { type: Number, default: 0 }, // purchased top-up credits
        topUpExpiry: { type: Date }, // 90-day expiry for purchased credits
    },

    // Gamification — daily login streak
    streak: { type: Number, default: 0 },
    lastLoginDate: { type: String, default: '' }, // YYYY-MM-DD format for day comparison

    // Referral
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referralCount: { type: Number, default: 0 },

    // First-time milestone rewards (one-time claims)
    milestones: {
        addedBrand: { type: Boolean, default: false },        // +10 cr
        firstContent: { type: Boolean, default: false },      // +5 cr
        firstImage: { type: Boolean, default: false },        // +5 cr
        firstVideo: { type: Boolean, default: false },        // +10 cr
        connectedSocial: { type: Boolean, default: false },   // +5 cr
        invitedTeam: { type: Boolean, default: false },       // +15 cr
    },

    // Active subscription
    activeSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },

    // Usage tracking
    usage: {
        contentGenerated: { type: Number, default: 0 },
        creativesGenerated: { type: Number, default: 0 },
        brandsCreated: { type: Number, default: 0 },
    },

    // Active Skills (Model A — persistent behavioral instructions injected into Fidato)
    activeSkills: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Skill' }],

    // AI Preferences
    preferences: {
        defaultTextProvider: { type: String, default: '' },
        defaultImageProvider: { type: String, default: '' },
        defaultTextModel: { type: String, default: '' },
        fidatoPopup: { type: Boolean, default: true },
        fidatoEnabled: { type: Boolean, default: true },
    },

    lastActive: { type: Date, default: Date.now },

    // Email Verification (Production Security)
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, select: false },
    verificationExpires: { type: Date, select: false },

    // Password Reset
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },

    // Registration Queue & Approval
    approvalStatus: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
    },
    queueNumber: { type: Number },

    // Persistence: track which onboarding walkthroughs have been completed
    completedWalkthroughs: { type: [String], default: [] },
}, { timestamps: true });

// Virtual: remaining credits (includes non-expired top-up)
userSchema.virtual('creditsRemaining').get(function () {
    if (this.role === 'superadmin' || this.plan === 'enterprise') return Infinity;
    const topUp = (this.credits.topUp > 0 && this.credits.topUpExpiry && new Date(this.credits.topUpExpiry) > new Date())
        ? this.credits.topUp : 0;
    return Math.max(0, (this.credits.total + this.credits.bonus + topUp) - this.credits.used);
});

userSchema.set('toJSON', { virtuals: true });

// Hash password before save
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.matchPassword = async function (entered) {
    if (!this.password) return false;
    return await bcrypt.compare(entered, this.password);
};

// Static: generate a unique creative user ID
userSchema.statics.generateUserId = async function () {
    for (let i = 0; i < 10; i++) {
        const adj = USER_ID_ADJECTIVES[Math.floor(Math.random() * USER_ID_ADJECTIVES.length)];
        const noun = USER_ID_NOUNS[Math.floor(Math.random() * USER_ID_NOUNS.length)];
        const num = Math.floor(Math.random() * 99) + 1;
        const id = `${adj}-${noun}-${num}`;
        const exists = await this.findOne({ userId: id });
        if (!exists) return id;
    }
    // Fallback: use timestamp
    return `user-${Date.now().toString(36)}`;
};

export default mongoose.model('User', userSchema);
