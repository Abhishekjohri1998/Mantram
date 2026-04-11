import mongoose from 'mongoose';
import dotenv from 'dotenv';
import SubscriptionPackage from './models/SubscriptionPackage.js';

dotenv.config();

async function inspect() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const pkgs = await SubscriptionPackage.find().sort({ displayOrder: 1 });
        console.log('--- Current Packages ---');
        pkgs.forEach(p => {
            console.log(`- ${p.name} (slug: ${p.slug}, order: ${p.displayOrder}, credits: ${p.credits.monthly})`);
        });
        console.log('------------------------');
        await mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}

inspect();
