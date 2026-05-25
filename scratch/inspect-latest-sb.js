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
      console.log('----------------------------------------------------');
      console.log(`Project ID: ${p._id}`);
      console.log(`Title: ${p.title}`);
      console.log(`Status: ${p.status}`);
      console.log(`Selected Model: ${p.selectedModel}`);
      if (p.storyboard) {
        console.log(`Storyboard Image URL: ${p.storyboard.imageUrl}`);
        console.log(`Storyboard Status: ${p.storyboard.status}`);
        console.log(`Storyboard Model: ${p.storyboard.imageModel || p.storyboard.model}`);
        console.log(`Storyboard LongFormJobId: ${p.storyboard.longFormJobId}`);
        console.log(`Storyboard Progress: ${p.storyboard.progress}`);
        console.log(`Storyboard Error: ${p.storyboard.error}`);
        console.log(`Storyboard Segment Statuses:`, JSON.stringify(p.storyboard.segmentStatuses));
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
