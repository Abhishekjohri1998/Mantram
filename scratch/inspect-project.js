import mongoose from '../backend/node_modules/mongoose/index.js';
import dotenv from 'dotenv';
import VideoProject from '../backend/models/VideoProject.js';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');
    const p = await VideoProject.findById('6a133402082f3dd70c95d541').lean();
    if (!p) {
      console.log('Project not found');
      return;
    }
    console.log('Project:', JSON.stringify(p, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
