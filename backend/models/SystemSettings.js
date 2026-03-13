import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

/**
 * Get a system setting by key (with default value).
 * Hardened against NoSQL injection.
 */
export async function getSetting(key, defaultValue = null) {
    try {
        if (typeof key !== 'string') return defaultValue;
        const setting = await SystemSettings.findOne({ key });
        return setting ? setting.value : defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Set a system setting.
 * Hardened against NoSQL injection.
 */
export async function setSetting(key, value, userId = null) {
    if (typeof key !== 'string') throw new Error('Invalid setting key');
    return SystemSettings.findOneAndUpdate(
        { key },
        { value, updatedBy: userId },
        { upsert: true, returnDocument: 'after' }
    );
}

export default SystemSettings;
