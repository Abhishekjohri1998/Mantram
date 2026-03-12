import mongoose from 'mongoose';

const systemSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

/**
 * Get a system setting by key (with default value).
 */
export async function getSetting(key, defaultValue = null) {
    try {
        const setting = await SystemSettings.findOne({ key });
        return setting ? setting.value : defaultValue;
    } catch {
        return defaultValue;
    }
}

/**
 * Set a system setting.
 */
export async function setSetting(key, value, userId = null) {
    return SystemSettings.findOneAndUpdate(
        { key },
        { value, updatedBy: userId },
        { upsert: true, returnDocument: 'after' }
    );
}

export default SystemSettings;
