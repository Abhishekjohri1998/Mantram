import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import QAdsCategory from '../models/QAdsCategory.js';
import QAdsPreset from '../models/QAdsPreset.js';
import User from '../models/User.js';

// Import hardcoded presets
import { Q_ADS_PRESETS } from '../agents/videoStudio/qAdsPresets.js';

// Category mapping
const CATEGORY_MAP = {
    'creator': { name: 'UGC', color: '#f59e0b', sortOrder: 10 },
    'brand': { name: 'BRAND / CINEMATIC', color: '#6366f1', sortOrder: 20 },
    'mantram-exclusive': { name: 'MANTRAM EXCLUSIVE', color: '#d97706', sortOrder: 30 }
};

const runSeed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected');

        // Find or create superadmin
        let admin = await User.findOne({ role: 'superadmin' });
        if (!admin) {
            admin = await User.findOne(); // Fallback to any user if superadmin doesn't exist
            if (!admin) {
                console.error('❌ No users found in database to act as creator.');
                process.exit(1);
            }
        }

        console.log(`👤 Using user ${admin.email} as creator`);

        // 1. Create Categories
        const categoryDocs = {};
        for (const [groupKey, catData] of Object.entries(CATEGORY_MAP)) {
            const slug = catData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            const category = await QAdsCategory.findOneAndUpdate(
                { slug },
                {
                    name: catData.name,
                    slug,
                    color: catData.color,
                    sortOrder: catData.sortOrder,
                    isActive: true,
                    createdBy: admin._id
                },
                { new: true, upsert: true }
            );
            categoryDocs[groupKey] = category._id;
            console.log(`📁 Category upserted: ${category.name}`);
        }

        // 2. Prepare Presets
        const presetsToInsert = [];

        // Add the presets from the hardcoded file
        for (const p of Q_ADS_PRESETS) {
            let presetCode = p.id;
            let name = p.name;
            let cameraSignature = p.cameraSignature;
            let pacing = p.pacing;
            let register = p.register;
            let environmentDefault = p.environmentDefault;

            // Apply specific overrides requested by user
            if (p.id === 'first_look' || p.id === 'ugc_first_reaction') {
                presetCode = 'ugc_first_reaction';
                name = 'First Reaction';
                cameraSignature = 'phone-native selfie handheld at eye-level, single continuous take';
                pacing = 'single uncut take, no transitions';
                register = 'casual conversational first-person, creator addresses camera directly';
                environmentDefault = 'real-world setting — bedroom, kitchen, café, or street with natural imperfect light';
            }

            presetsToInsert.push({
                presetCode,
                categoryId: categoryDocs[p.group],
                name,
                tagline: p.tagline,
                description: p.description,
                isMantramExclusive: p.group === 'mantram-exclusive',
                isActive: true,
                sortOrder: presetsToInsert.length * 10,
                createdBy: admin._id,
                promptRules: {
                    cameraSignature,
                    pacing,
                    register,
                    environmentDefault
                }
            });
        }

        // Insert the specific "Cinematic FMCG" requested by the user if it's not already in the array
        const hasFmcg = presetsToInsert.find(p => p.presetCode === 'cinematic_fmcg');
        if (!hasFmcg) {
            presetsToInsert.push({
                presetCode: 'cinematic_fmcg',
                categoryId: categoryDocs['mantram-exclusive'],
                name: 'Cinematic FMCG',
                tagline: 'Ultra-premium product focus.',
                description: 'A luxurious, silent reveal of the product with macro details and dramatic lighting.',
                isMantramExclusive: true,
                isActive: true,
                sortOrder: presetsToInsert.length * 10,
                createdBy: admin._id,
                promptRules: {
                    cameraSignature: 'macro close-up of product label and surface texture, slow orbit at product height, pulls back to reveal full product on dark wet stone surface',
                    pacing: 'slow and deliberate, no fast cuts, every second held',
                    register: 'ultra-premium silent — no dialogue, no presenter, product is the only subject',
                    environmentDefault: 'dark studio — botanical, aqua, or charcoal — with rim lighting in brand accent color and mid-ground mist'
                }
            });
        }

        // 3. Upsert Presets
        for (const pData of presetsToInsert) {
            const preset = await QAdsPreset.findOneAndUpdate(
                { presetCode: pData.presetCode },
                { $set: pData },
                { new: true, upsert: true }
            );
            console.log(`🎬 Preset upserted: ${preset.name} (${preset.presetCode})`);
        }

        console.log('✅ Seeding complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
};

runSeed();
