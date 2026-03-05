import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['user', 'admin', 'team-member', 'superadmin'], default: 'user' },
    plan: { type: String, enum: ['starter', 'professional', 'enterprise'], default: 'starter' },
    avatar: { type: String, default: '' },
    company: { type: String, default: '' },

    // Team / Organization
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    teamRole: { type: String, enum: ['owner', 'manager', 'member', ''], default: '' },

    // Per-studio access (for team members)
    studioAccess: {
        contentStudio: { type: Boolean, default: true },
        creativeStudio: { type: Boolean, default: true },
        seoStudio: { type: Boolean, default: true },
        brainstormStudio: { type: Boolean, default: true },
        videoStudio: { type: Boolean, default: true },
        d2cAnalytics: { type: Boolean, default: false },
        adStudio: { type: Boolean, default: false },
        smartCalendar: { type: Boolean, default: true },
        conversationStudio: { type: Boolean, default: false },
    },

    // Which brands this team member can access
    brandAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],

    // Credits
    credits: {
        total: { type: Number, default: 50 },
        used: { type: Number, default: 0 },
        bonus: { type: Number, default: 0 }, // extra credits from coupons/admin
        resetDate: { type: Date }, // next monthly reset date
    },

    // Active subscription
    activeSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },

    // Usage tracking
    usage: {
        contentGenerated: { type: Number, default: 0 },
        creativesGenerated: { type: Number, default: 0 },
        brandsCreated: { type: Number, default: 0 },
    },

    // AI Preferences
    preferences: {
        defaultTextProvider: { type: String, default: '' },
        defaultImageProvider: { type: String, default: '' },
        defaultTextModel: { type: String, default: '' },
        fidatoPopup: { type: Boolean, default: true },
        fidatoEnabled: { type: Boolean, default: true },
    },

    lastActive: { type: Date, default: Date.now },
}, { timestamps: true });

// Virtual: remaining credits
userSchema.virtual('creditsRemaining').get(function () {
    if (this.role === 'superadmin' || this.plan === 'enterprise') return Infinity;
    return Math.max(0, (this.credits.total + this.credits.bonus) - this.credits.used);
});

userSchema.set('toJSON', { virtuals: true });

// Hash password before save
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare password
userSchema.methods.matchPassword = async function (entered) {
    return await bcrypt.compare(entered, this.password);
};

export default mongoose.model('User', userSchema);
