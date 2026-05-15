/**
 * fix-corrupted-credits.js
 *
 * One-time repair: finds User documents where `credits` is stored as a
 * non-object (number, NaN, null, undefined) and resets it to a valid
 * subdocument with safe defaults so `$inc: { 'credits.bonus': N }` works.
 *
 * Usage:
 *   cd backend
 *   node scripts/fix-corrupted-credits.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;
if (!MONGO_URI) { console.error('No MONGODB_URI in .env'); process.exit(1); }

await mongoose.connect(MONGO_URI);
console.log('✅ MongoDB connected');

const db = mongoose.connection.db;
const users = db.collection('users');

// Find all users where credits is NOT an object (null, NaN, number, string, etc.)
// MongoDB type codes: 1 = double, 2 = string, 10 = null
// We want to find where credits is NOT of type 3 (object/document)
const cursor = users.find({
    $or: [
        { credits: { $type: 'double' } },   // stored as number (incl. NaN)
        { credits: { $type: 'string' } },   // stored as string
        { credits: null },                   // null
        { credits: { $exists: false } },     // missing entirely
    ]
});

let fixed = 0;
let total = 0;

for await (const doc of cursor) {
    total++;
    const oldVal = doc.credits;
    console.log(`  🔧 Fixing user ${doc._id} (${doc.email}) — credits was: ${JSON.stringify(oldVal)}`);

    await users.updateOne(
        { _id: doc._id },
        {
            $set: {
                credits: {
                    total: 100,   // default free plan allowance
                    used:  0,
                    bonus: 0,
                    topUp: 0,
                    resetDate: null,
                    topUpExpiry: null,
                }
            }
        }
    );
    fixed++;
}

console.log(`\n✅ Done — fixed ${fixed} / ${total} corrupted documents`);
if (fixed === 0) console.log('   No corrupted documents found.');

await mongoose.disconnect();
process.exit(0);
