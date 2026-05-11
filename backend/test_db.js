import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '/Users/dasachin/Desktop/Output/Mantram AI/backend/.env' });
import VideoProject from './models/VideoProject.js';

async function check() {
    try {
        console.log("Connecting to:", process.env.MONGODB_URI.substring(0, 20) + '...');
        await mongoose.connect(process.env.MONGODB_URI);
        const failed = await VideoProject.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(3);
        for (const f of failed) {
            console.log("Title:", f.title);
            console.log("Error:", f.generation?.error || f.error);
            console.log("---");
        }
    } catch(e) {
        console.error("DB Error:", e);
    }
    process.exit(0);
}
check();
