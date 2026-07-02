import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

const fixCredits = async () => {
    await connectDB();
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Find users where credits is an object (corrupted by legacy daily reward middleware)
    const corruptedUsers = await usersCollection.find({ credits: { $type: "object" } }).toArray();
    
    console.log(`Found ${corruptedUsers.length} users with corrupted credits (type object).`);

    for (const user of corruptedUsers) {
        console.log(`Fixing user: ${user.email} (current credits: ${JSON.stringify(user.credits)})`);
        
        // Safely extract a number from the corrupted object
        let newCreditAmount = 0;
        if (user.credits) {
            newCreditAmount = (user.credits.total || 0) + (user.credits.bonus || 0) + (user.credits.topUp || 0) - (user.credits.used || 0);
            if (newCreditAmount < 0) newCreditAmount = 0;
        }

        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { credits: newCreditAmount } 
            }
        );
        console.log(`Fixed user: ${user.email} -> Set credits to ${newCreditAmount}`);
    }

    // Also check for null or NaN credits
    const nullCreditsUsers = await usersCollection.find({ 
        $or: [
            { credits: null },
            { credits: { $type: "double" }, $expr: { $eq: [{ $type: "$credits" }, "double"] } } // Simple check just to ensure it's not actually NaN but fixing null is easier.
        ]
    }).toArray();
    
    const actualNulls = nullCreditsUsers.filter(u => u.credits === null || Number.isNaN(u.credits));
    
    console.log(`Found ${actualNulls.length} users with null or NaN credits.`);
    for (const user of actualNulls) {
         console.log(`Fixing user: ${user.email}`);
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { credits: 0 } 
            }
        );
        console.log(`Fixed user: ${user.email}`);
    }

    console.log('Done fixing users.');
    process.exit(0);
};

fixCredits();
