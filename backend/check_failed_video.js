import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import VideoProject from './models/VideoProject.js';

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const targetId = '6a3d1c40e01aaa838a2930ff';
    console.log("Fetching project:", targetId);
    const p = await VideoProject.findById(targetId);
    if (p) {
        console.log("=== COMPARED SUCCESSFUL PROJECT ===");
        console.log(JSON.stringify(p, null, 2));
    } else {
        console.log("Project not found.");
    }
    process.exit(0);
}
check();
