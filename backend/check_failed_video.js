import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import VideoProject from './models/VideoProject.js';

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const failed = await VideoProject.find({ status: 'failed' }).sort({ createdAt: -1 }).limit(3);
    for (const f of failed) {
        console.log("Title:", f.title);
        console.log("Error:", f.generation?.error || f.error);
        console.log("---");
    }
    process.exit(0);
}
check();
