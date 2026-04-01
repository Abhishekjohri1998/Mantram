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

        // 1. Check if stellar already exists
        const existingStellar = await CreditPack.findOne({ slug: 'stellar' });
        if (existingStellar) {
            console.log('Stellar pack already exists. Skipping insertion.');
        } else {
            console.log('Adding Stellar pack...');
            await CreditPack.create({
                name: '🌟 Stellar',
                slug: 'stellar',
                credits: 650,
                bonusCredits: 150,
                price: 3000,
                icon: 'stars',
                badge: 'Most Popular',
                badgeColor: '#8b5cf6',
                displayOrder: 6,
                validityDays: 365,
                description: '+150 bonus! Superior value',
                color: '#8b5cf6'
            });
            console.log('Stellar pack added.');
        }

        // 2. Adjust displayOrder for all packs to be safe
        console.log('Adjusting display orders...');
        const allPacks = await CreditPack.find().sort({ price: 1 });
        
        for (let i = 0; i < allPacks.length; i++) {
            const pack = allPacks[i];
            const newOrder = i + 1;
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
