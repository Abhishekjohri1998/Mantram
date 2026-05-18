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

    // Find users where credits is not an object
    const corruptedUsers = await usersCollection.find({ credits: { $type: "double" } }).toArray();
    
    console.log(`Found ${corruptedUsers.length} users with corrupted credits (type double/NaN).`);

    for (const user of corruptedUsers) {
        console.log(`Fixing user: ${user.email}`);
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { 
                    credits: {
                        total: 100,
                        used: 0,
                        bonus: 0,
                        topUp: 0
                    }
                } 
            }
        );
        console.log(`Fixed user: ${user.email}`);
    }

    // Also check for null credits or any other non-object types
    const nullCreditsUsers = await usersCollection.find({ credits: null }).toArray();
    console.log(`Found ${nullCreditsUsers.length} users with null credits.`);
    for (const user of nullCreditsUsers) {
         console.log(`Fixing user: ${user.email}`);
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { 
                    credits: {
                        total: 100,
                        used: 0,
                        bonus: 0,
                        topUp: 0
                    }
                } 
            }
        );
        console.log(`Fixed user: ${user.email}`);
    }

    console.log('Done fixing users.');
    process.exit(0);
};

fixCredits();
