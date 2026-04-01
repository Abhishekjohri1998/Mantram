import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import CreditPack from '../models/CreditPack.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/da-mantram';

async function migrate() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        // 1. Check if festive-special already exists
        const existingPromo = await CreditPack.findOne({ slug: 'festive-special' });
        if (existingPromo) {
            console.log('Festive Special promo pack already exists. Skipping insertion.');
        } else {
            console.log('Adding Festive Special promo pack...');
            await CreditPack.create({
                name: '🎁 Festive Special',
                slug: 'festive-special',
                credits: 800,
                bonusCredits: 200,
                price: 3000,
                promoOriginalPrice: 4286,
                promoDiscount: 30,
                isPromo: true,
                icon: 'redeem',
                badge: 'LIMITED TIME',
                badgeColor: '#ec4899',
                displayOrder: 0,
                validityDays: 365,
                description: '30% OFF! Best value deal',
                color: '#ec4899'
            });
            console.log('Festive Special promo pack added.');
        }

        // 2. Adjust displayOrder for all packs to ensure consistency
        console.log('Adjusting display orders...');
        const allPacks = await CreditPack.find().sort({ isPromo: -1, price: 1 });
        
        for (let i = 0; i < allPacks.length; i++) {
            const pack = allPacks[i];
            const newOrder = i; // isPromo pack gets 0, then 1, 2, 3...
            if (pack.displayOrder !== newOrder) {
                await CreditPack.updateOne({ _id: pack._id }, { $set: { displayOrder: newOrder } });
                console.log(`Updated ${pack.slug}: order ${pack.displayOrder} -> ${newOrder}`);
            }
        }

        console.log('Migration complete.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
