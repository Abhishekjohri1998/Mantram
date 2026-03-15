import mongoose from 'mongoose';

const gscSnapshotSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
    siteUrl: { type: String, required: true },

    // Snapshot of top queries and their positions
    queries: [{
        query: String,
        clicks: Number,
        impressions: Number,
        ctr: Number,        // 0-1 scale
        position: Number,   // Average position
    }],

    // Snapshot of top pages
    pages: [{
        page: String,
        clicks: Number,
        impressions: Number,
        ctr: Number,
        position: Number,
    }],

    // Summary metrics
    totalClicks: { type: Number, default: 0 },
    totalImpressions: { type: Number, default: 0 },
    averagePosition: { type: Number, default: 0 },
    averageCtr: { type: Number, default: 0 },

    // Date range for the snapshot
    dateFrom: { type: Date },
    dateTo: { type: Date },

}, { timestamps: true });

gscSnapshotSchema.index({ user: 1, brand: 1, createdAt: -1 });
gscSnapshotSchema.index({ brand: 1, siteUrl: 1, createdAt: -1 });

export default mongoose.model('GscSnapshot', gscSnapshotSchema);
