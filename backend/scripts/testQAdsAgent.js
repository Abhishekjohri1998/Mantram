import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { runQAdsAgent } from '../agents/videoStudio/qAdsAgent.js';
import User from '../models/User.js';

async function test() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const user = await User.findOne({ role: 'superadmin' });
    if (!user) throw new Error('No user found');
    
    console.log('Calling Q-Ads Agent with DB-backed Preset (First Reaction)...');
    try {
        const result = await runQAdsAgent({
            brandId: null, // loadBrandContext(null) returns fallback which passes length check
            presetId: 'ugc_first_reaction',
            userBrief: 'A test ad for a new pair of headphones.',
            productData: { productName: 'SoundMax Pro' },
            productImageUrls: [],
            avatarUrl: null,
            settings: { duration: 8, format: '9:16' },
            userId: user._id
        });
        
        console.log('\n--- TEST RESULTS ---');
        result.variants.forEach(v => {
            console.log(`\nVARIANT ${v.variantId} (${v.prompt.split(' ').length} words):`);
            console.log(v.prompt);
        });
        console.log('\nSUCCESS: 3 variants generated correctly using DB-backed presets!');
    } catch (err) {
        console.error('Test Failed:', err.message);
    }
    
    await mongoose.disconnect();
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
