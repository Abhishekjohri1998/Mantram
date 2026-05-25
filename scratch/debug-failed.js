import mongoose from '../backend/node_modules/mongoose/index.js';
import dotenv from 'dotenv';
import VideoProject from '../backend/models/VideoProject.js';
import { getSignedUrlIfNeeded } from '../backend/utils/s3.js';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const p = await VideoProject.findById('6a134063ae762c20847c4fd6').lean();
    if (!p) {
      console.log('Project not found');
      process.exit(0);
    }
    const rawUrl = p.storyboard?.imageUrl;
    console.log('Raw S3 URL:', rawUrl);
    const signedUrl = await getSignedUrlIfNeeded(rawUrl);
    console.log('Signed URL:', signedUrl);
    
    // Fetch the signed URL
    const res = await fetch(signedUrl);
    console.log('Fetch Status:', res.status);
    if (!res.ok) {
      console.log('Fetch Error Body:', await res.text());
    } else {
      console.log('Fetch Success!');
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
