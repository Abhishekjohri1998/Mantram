import mongoose from 'mongoose';
import config from './config/env.js';

async function checkRawDb() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log("Connected to MongoDB.");

        // Define a temporary schema with Mixed _id
        const testSchema = new mongoose.Schema({
            _id: { type: mongoose.Schema.Types.Mixed },
            email: String,
            name: String
        });
        const TestUser = mongoose.model('TestUserMixed', testSchema, 'users');

        // 1. Fetch the user with a String ID
        const stringUser = await TestUser.findOne({ email: 'abhishek.johri.659@gmail.com' });
        console.log("\nString User fetch:");
        if (stringUser) {
            console.log("Has _id:", !!stringUser._id, "| Type:", typeof stringUser._id);
            console.log("Value:", stringUser._id);
        }

        // 2. Fetch a user with an ObjectId
        const objUser = await TestUser.findOne({ email: { $ne: 'abhishek.johri.659@gmail.com' } });
        console.log("\nObjectId User fetch:");
        if (objUser) {
            console.log("Has _id:", !!objUser._id, "| Type:", typeof objUser._id);
        }

        // 3. Test saving a NEW user to see if MongoDB autogenerates the ID correctly
        const newUser = new TestUser({ email: 'test_mixed_id@example.com', name: 'Test Mixed' });
        await newUser.save();
        console.log("\nNew User Save:");
        console.log("Has _id:", !!newUser._id, "| Type:", typeof newUser._id);

        // Cleanup test user
        await TestUser.deleteOne({ email: 'test_mixed_id@example.com' });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkRawDb();
