import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in the environment variables');
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

const fixSubscriptionCredits = async () => {
    await connectDB();
    const db = mongoose.connection.db;
    const subscriptionsCollection = db.collection('subscriptions');

    // Find subscription documents where credits is stored as an object
    const corruptedSubs = await subscriptionsCollection.find({ credits: { $type: "object" } }).toArray();
    
    console.log(`Found ${corruptedSubs.length} subscriptions with corrupted credits (type object).`);

    for (const sub of corruptedSubs) {
        console.log(`Fixing subscription ID: ${sub._id} (plan: ${sub.plan}, current credits: ${JSON.stringify(sub.credits)})`);
        
        let newCreditAmount = 0;
        if (sub.credits) {
            newCreditAmount = (sub.credits.total || 0) - (sub.credits.used || 0);
            if (newCreditAmount < 0) newCreditAmount = 0;
        }

        await subscriptionsCollection.updateOne(
            { _id: sub._id },
            { 
                $set: { credits: newCreditAmount } 
            }
        );
        console.log(`Fixed subscription ID: ${sub._id} -> Set credits to ${newCreditAmount}`);
    }

    // Also check for null or NaN credits in subscriptions
    const nullCreditsSubs = await subscriptionsCollection.find({ 
        $or: [
            { credits: null },
            { credits: { $type: "double" }, $expr: { $eq: [{ $type: "$credits" }, "double"] } }
        ]
    }).toArray();
    
    const actualNulls = nullCreditsSubs.filter(sub => sub.credits === null || Number.isNaN(sub.credits));
    
    console.log(`Found ${actualNulls.length} subscriptions with null or NaN credits.`);
    for (const sub of actualNulls) {
        console.log(`Fixing subscription ID: ${sub._id}`);
        await subscriptionsCollection.updateOne(
            { _id: sub._id },
            { 
                $set: { credits: 0 } 
            }
        );
        console.log(`Fixed subscription ID: ${sub._id}`);
    }

    console.log('Done fixing subscriptions.');
    process.exit(0);
};

fixSubscriptionCredits();
