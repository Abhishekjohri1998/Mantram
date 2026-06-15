/**
 * ApiKey Model
 *
 * Stores Mantram MCP API keys for external integrations.
 * The full plaintext key is shown ONCE on creation and never stored.
 * We store only a SHA-256 hash for lookup.
 *
 * Key format: mnt_sk_<32 hex chars>
 */

import mongoose from 'mongoose';
import crypto from 'crypto';

const ApiKeySchema = new mongoose.Schema({
    // Owner
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Human-readable label set by the user (e.g. "Claude Desktop - Work")
    name: { type: String, required: true, trim: true, maxlength: 80 },

    // SHA-256 hash of the full key — used for fast O(1) lookups on every MCP request
    keyHash: { type: String, required: true, unique: true },

    // First 12 chars of the plaintext key — shown in UI as a hint (e.g. "mnt_sk_a3f8...")
    keyPrefix: { type: String, required: true },

    // Soft delete / revocation
    isActive: { type: Boolean, default: true, index: true },

    // Usage tracking
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 },

    // Optional expiry (null = never expires)
    expiresAt: { type: Date, default: null },

}, { timestamps: true });

// Index for auth middleware: hash + active + not expired
ApiKeySchema.index({ keyHash: 1, isActive: 1 });

/**
 * Static: generate a new plaintext key and its hash.
 * Returns { plaintext, hash, prefix }
 */
ApiKeySchema.statics.generate = function () {
    const raw = crypto.randomBytes(24).toString('hex'); // 48 hex chars
    const plaintext = `mnt_sk_${raw}`;
    const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
    const prefix = plaintext.substring(0, 14); // "mnt_sk_" + 7 chars
    return { plaintext, hash, prefix };
};

/**
 * Static: look up a key by its plaintext value. Returns the ApiKey doc or null.
 * Automatically updates lastUsedAt and requestCount.
 */
ApiKeySchema.statics.findByPlaintext = async function (plaintext) {
    if (!plaintext || !plaintext.startsWith('mnt_sk_')) return null;
    const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
    const key = await this.findOne({ keyHash: hash, isActive: true });
    if (!key) return null;

    // Check expiry
    if (key.expiresAt && key.expiresAt < new Date()) {
        await this.findByIdAndUpdate(key._id, { isActive: false });
        return null;
    }

    // Fire-and-forget usage tracking
    this.findByIdAndUpdate(key._id, {
        lastUsedAt: new Date(),
        $inc: { requestCount: 1 },
    }).catch(() => {});

    return key;
};

export default mongoose.model('ApiKey', ApiKeySchema);
