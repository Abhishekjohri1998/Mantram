/**
 * GenerationJob — Persistent background generation job tracking
 *
 * Allows the frontend to disconnect (navigate away, refresh, close tab) while
 * the backend continues running the pipeline. Results are polled on reconnect.
 *
 * TTL: Jobs auto-delete 48 hours after creation via MongoDB TTL index.
 */

import mongoose from 'mongoose';

const GenerationJobSchema = new mongoose.Schema(
    {
        // Unique identifier sent to frontend — short UUID
        jobId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },

        // Owner
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },

        // Job source
        type: {
            type: String,
            enum: ['ai-create', 'photoshoot', 'campaign-shot', 'monthly-strategy', 'research', 'video'],
            default: 'ai-create',
        },

        // Human-readable display context (shown in notification panel + header banner)
        meta: {
            label:     { type: String },  // e.g. "May 2025 — E-Commerce Strategy"
            page:      { type: String },  // client-side route, e.g. "/brainstorm-studio"
            brandName: { type: String },
        },

        // Status lifecycle: pending → processing → completed | failed | cancelled
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
            default: 'pending',
            index: true,
        },

        // ── Input (stored so backend can process without the HTTP request) ──
        prompt: { type: String },
        format: { type: String },  // instagram-post, facebook-ad, etc.
        options: { type: mongoose.Schema.Types.Mixed },  // full options object
        photoshootPayload: { type: mongoose.Schema.Types.Mixed },  // for photoshoot jobs

        // Credits deducted at job creation (for refund on failure)
        creditsDeducted: { type: Number, default: 0 },

        // ── Output ──
        // The generated Creative document ID (if ai-create)
        creativeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Creative' },
        // Direct image URL (for quick display without fetching Creative)
        imageUrl: { type: String },
        // Full pipeline result (raw from generate endpoint)
        result: { type: mongoose.Schema.Types.Mixed },
        // Error message (if failed)
        errorMessage: { type: String },
        // Warnings from pipeline
        warnings: [{ type: String }],

        // ── Progress steps (mirrors the existing progressId system) ──
        steps: [
            {
                agent: String,
                message: String,
                status: { type: String, enum: ['working', 'done', 'error'] },
                ts: { type: Date, default: Date.now },
            },
        ],

        // ── Timing ──
        startedAt:   { type: Date },
        completedAt: { type: Date },
        cancelledAt: { type: Date },

        // ── TTL — MongoDB auto-deletes documents 48h after creation ──
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 48 * 60 * 60 * 1000),
            index: { expireAfterSeconds: 0 },
        },
    },
    { timestamps: true }
);

// Compound index for efficient user job listing
GenerationJobSchema.index({ user: 1, createdAt: -1 });
GenerationJobSchema.index({ user: 1, status: 1 });

export default mongoose.model('GenerationJob', GenerationJobSchema);
