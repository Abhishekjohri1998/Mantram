import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema({
    summary: { type: String, required: true },
    details: { type: String },
    severity: { type: String, enum: ['critical', 'notable', 'info'], default: 'info' },
    category: { type: String }, // e.g., 'price_change', 'new_product', 'new_ad', etc.
    rawData: { type: String }, // raw search results for reference
    isNewlyDiscovered: { type: Boolean, default: true },
    notified: { type: Boolean, default: false },
}, { timestamps: true });

const intelMissionSchema = new mongoose.Schema({
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Mission definition
    title: { type: String, required: true },
    type: {
        type: String,
        enum: ['competitor_watch', 'price_alert', 'ad_monitor', 'product_launch', 'strategy_change'],
        required: true,
    },
    target: {
        name: { type: String, required: true },       // Competitor name
        website: { type: String },                      // Competitor website URL
        platforms: [{ type: String }],                  // e.g., ['instagram', 'facebook', 'amazon']
        keywords: [{ type: String }],                   // Additional search keywords
    },
    instructions: { type: String },                     // User's custom instructions (free-text)
    studio: { type: String, enum: ['seo', 'performance', 'd2c'], default: 'seo' },

    // Scheduling
    frequency: { type: String, enum: ['hourly', 'every_2h', 'daily', 'weekly'], default: 'daily' },
    status: { type: String, enum: ['active', 'paused', 'completed'], default: 'active', index: true },

    // Tracking
    findings: [findingSchema],
    lastCheckedAt: { type: Date },
    lastFindingAt: { type: Date },
    totalChecks: { type: Number, default: 0 },
    totalFindings: { type: Number, default: 0 },

    // Notification
    notifyVia: { type: String, enum: ['fidato', 'email', 'both'], default: 'fidato' },
}, {
    timestamps: true,
});

// Index for scheduler: find active missions due for check
intelMissionSchema.index({ status: 1, lastCheckedAt: 1, frequency: 1 });

export default mongoose.model('IntelMission', intelMissionSchema);
