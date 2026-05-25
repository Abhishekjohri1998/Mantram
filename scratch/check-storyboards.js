import mongoose from '../backend/node_modules/mongoose/index.js';
import dotenv from 'dotenv';
import VideoProject from '../backend/models/VideoProject.js';

import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const projects = await VideoProject.find({ studioMode: 'storyboard' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    for (const p of projects) {
      console.log(`Project: ${p._id} | Title: ${p.title}`);
      console.log(`  storyboard.imageUrl: ${p.storyboard?.imageUrl}`);
      console.log(`  storyboard.status: ${p.storyboard?.status}`);
      console.log(`  finalVideoUrl: ${p.finalVideoUrl}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
